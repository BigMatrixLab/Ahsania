import json

import httpx
import pytest

from capture.config import Settings
from capture.hospital.client import HospitalUnavailable, NotAtHospital, UpdateResult, make_hospital
from capture.hospital.http import HttpHospital
from capture.hospital.stub import StubHospital


def stub(tmp_path):
    return StubHospital(tmp_path / "hospital.json")


def raw(tmp_path):
    return json.loads((tmp_path / "hospital.json").read_text(encoding="utf-8"))


# --- the stand-in hospital ---


def test_stub_seeds_thirty_patients_once(tmp_path):
    first = [p.rc for p in stub(tmp_path).list_patients()]
    second = [p.rc for p in stub(tmp_path).list_patients()]
    assert len(first) == 30
    assert sorted(first) == sorted(second) == [f"RC5000{n:02d}" for n in range(1, 31)]


def test_stub_patients_have_some_values_but_not_all(tmp_path):
    values = stub(tmp_path).get_values("RC500001", "import_patient")
    assert values.get("age_years") is not None
    assert 5 < len(values) < 80


def test_stub_holds_an_identifying_key_on_rc500030(tmp_path):
    assert stub(tmp_path).get_values("RC500030", "import_patient")["patient_name"] == "Test"


def test_stub_get_values_unknown_rc_raises(tmp_path):
    with pytest.raises(NotAtHospital):
        stub(tmp_path).get_values("RC1", "import_patient")


def test_stub_get_values_for_a_form_it_lacks_is_empty(tmp_path):
    hospital = stub(tmp_path)
    data = raw_after_touch(tmp_path, hospital)
    rc = next(rc for rc, p in data["patients"].items() if "treatment" not in p["forms"])
    assert hospital.get_values(rc, "treatment") == {}


def raw_after_touch(tmp_path, hospital):
    hospital.list_patients()
    return raw(tmp_path)


def test_stub_update_writes_new_and_matching_keys(tmp_path):
    hospital = stub(tmp_path)
    hospital.get_values("RC500001", "import_patient")  # seeds the file
    data = raw(tmp_path)
    data["patients"]["RC500001"]["forms"]["import_patient"].pop("education", None)
    (tmp_path / "hospital.json").write_text(json.dumps(data), encoding="utf-8")
    result = stub(tmp_path).update("RC500001", "import_patient", {"education": "primary"}, {})
    assert result == UpdateResult(applied=["education"], conflicts=[])
    assert stub(tmp_path).get_values("RC500001", "import_patient")["education"] == "primary"


def test_stub_update_conflict_when_value_moved(tmp_path):
    hospital = stub(tmp_path)
    hospital.get_values("RC500001", "import_patient")
    data = raw(tmp_path)
    data["patients"]["RC500001"]["forms"]["import_patient"]["age_years"] = 56
    (tmp_path / "hospital.json").write_text(json.dumps(data), encoding="utf-8")
    result = stub(tmp_path).update("RC500001", "import_patient", {"age_years": 58}, {"age_years": 50})
    assert result == UpdateResult(applied=[], conflicts=[{"key": "age_years", "hospital_value": 56}])
    assert stub(tmp_path).get_values("RC500001", "import_patient")["age_years"] == 56


def test_stub_update_unknown_rc_raises(tmp_path):
    with pytest.raises(NotAtHospital):
        stub(tmp_path).update("RC1", "import_patient", {"age_years": 1}, {})


# --- the real hospital, over HTTP ---


def http(handler):
    return HttpHospital("https://hospital.example/api", "t", 5, transport=httpx.MockTransport(handler))


def test_http_list_and_get_send_bearer_token():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer t"
        seen.append((request.method, request.url.path, dict(request.url.params)))
        if request.url.path.endswith("/patients"):
            return httpx.Response(200, json=[{"rc": "RC1", "updated_at": "2026-11-01"}])
        return httpx.Response(200, json={"rc": "RC1", "values": {"age_years": 56}, "updated_at": "2026-11-01"})

    hospital = http(handler)
    assert [p.rc for p in hospital.list_patients()] == ["RC1"]
    assert hospital.get_values("RC1", "import_patient") == {"age_years": 56}
    assert seen == [("GET", "/api/patients", {}), ("GET", "/api/patients/RC1", {"form": "import_patient"})]


def test_http_404_is_not_at_hospital():
    hospital = http(lambda request: httpx.Response(404, json={"detail": "no"}))
    with pytest.raises(NotAtHospital):
        hospital.get_values("RC1", "import_patient")


@pytest.mark.parametrize("failure", ["connect", "500"])
def test_http_connect_error_and_500_are_unavailable(failure):
    def handler(request):
        if failure == "connect":
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(500)

    with pytest.raises(HospitalUnavailable):
        http(handler).list_patients()


def test_http_update_parses_applied_and_conflicts():
    def handler(request):
        assert request.method == "PATCH"
        assert request.url.path == "/api/patients/RC1"
        assert json.loads(request.content) == {"form": "import_patient", "set": {"age_years": 58}, "expect": {"age_years": 56}}
        return httpx.Response(200, json={"applied": [], "conflicts": [{"key": "age_years", "hospital_value": 57}]})

    result = http(handler).update("RC1", "import_patient", {"age_years": 58}, {"age_years": 56})
    assert result == UpdateResult(applied=[], conflicts=[{"key": "age_years", "hospital_value": 57}])


# --- picking one by settings ---


def test_make_hospital_picks_by_setting(tmp_path):
    base = Settings(storage_dir=tmp_path)
    assert isinstance(make_hospital(base), StubHospital)
    assert isinstance(make_hospital(base.model_copy(update={"hospital": "http", "hospital_url": "https://h"})), HttpHospital)
    with pytest.raises(ValueError):
        make_hospital(base.model_copy(update={"hospital": "other"}))


def test_stub_file_defaults_to_the_storage_folder(tmp_path):
    hospital = make_hospital(Settings(storage_dir=tmp_path))
    hospital.list_patients()
    assert (tmp_path / "hospital-stub.json").exists()


def test_stub_values_look_like_real_patients(tmp_path):
    import yaml

    from capture.hospital.stub import TEMPLATES_DIR

    hospital = stub(tmp_path)
    fields = {f["key"]: f for f in yaml.safe_load((TEMPLATES_DIR / "import_patient.yaml").read_text(encoding="utf-8"))["fields"]}
    for patient in hospital.list_patients():
        values = hospital.get_values(patient.rc, "import_patient")
        assert 35 <= values["age_years"] <= 85
        assert values["sex"] in ("male", "female")
        if "height_cm" in values:
            assert 140 <= values["height_cm"] <= 190
        if "weight_kg" in values:
            assert 35 <= values["weight_kg"] <= 100
        for key, value in values.items():
            condition = fields.get(key, {}).get("show_if")
            if condition:  # a follow-on answer only where its question says so
                assert values.get(condition["key"]) in condition["values"], (patient.rc, key)


@pytest.mark.parametrize("body", [{"not": "a list"}, [{"no_rc": 1}], "text"])
def test_http_malformed_answer_is_unavailable(body):
    with pytest.raises(HospitalUnavailable):
        http(lambda request: httpx.Response(200, json=body)).list_patients()


def test_http_malformed_update_answer_is_unavailable():
    with pytest.raises(HospitalUnavailable):
        http(lambda request: httpx.Response(200, json=["no"])).update("RC1", "import_patient", {"a": 1}, {})
