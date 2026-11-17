import json
import uuid

import pytest

from capture.hospital.client import HospitalUnavailable
from capture.hospital.stub import StubHospital

DOWN = "Hospital system not reachable. Type the RC number and fill the form by hand."
UNKNOWN = "This RC number is not in the hospital system."


@pytest.fixture
def stub(app, settings):
    """The stand-in hospital the app uses, plus a way to edit its file directly."""
    hospital = app.state.hospital
    assert isinstance(hospital, StubHospital)
    hospital.list_patients()  # seed the file

    class Stub:
        path = hospital.path

        def values(self, rc, form="import_patient"):
            return hospital.get_values(rc, form)

        def edit(self, rc, form, **changes):
            data = json.loads(self.path.read_text(encoding="utf-8"))
            data["patients"][rc]["forms"].setdefault(form, {}).update(changes)
            self.path.write_text(json.dumps(data), encoding="utf-8")

    return Stub()


def import_record(client, rc, form="import_patient", from_hospital=True):
    meta = {"reg_no": rc, "template_key": form, "client_upload_id": str(uuid.uuid4()), "from_hospital": from_hospital}
    return client.post("/api/records", data={"meta": json.dumps(meta)})


def test_patient_list_marks_imported(team, stub):
    assert import_record(team.doctor, "RC500001").status_code == 201
    rows = {r["rc"]: r["imported"] for r in team.doctor.get("/api/hospital/patients?form=import_patient").json()}
    assert len(rows) == 30
    assert rows["RC500001"] is True
    assert not any(v for rc, v in rows.items() if rc != "RC500001")


def test_imported_ticks_are_per_form(team, stub):
    import_record(team.doctor, "RC500003")
    rows = {r["rc"]: r["imported"] for r in team.doctor.get("/api/hospital/patients?form=treatment").json()}
    assert rows["RC500003"] is False


def test_import_fills_known_fields_and_snapshot(team, stub):
    record = import_record(team.doctor, "RC500001").json()
    hospital = stub.values("RC500001")
    assert record["hospital_snapshot"] == hospital
    assert record["values"] == hospital
    assert record["status"] == "draft"
    assert record["events"][0]["action"] == "import"


def test_the_visit_date_defaults_to_today_when_the_hospital_has_none(team, stub):
    from capture.clock import today

    data = json.loads(stub.path.read_text(encoding="utf-8"))
    data["patients"]["RC500002"]["forms"]["import_patient"].pop("visit_date", None)
    stub.path.write_text(json.dumps(data), encoding="utf-8")
    record = import_record(team.doctor, "RC500002").json()
    assert record["values"]["visit_date"] == today().isoformat()
    assert "visit_date" not in record["hospital_snapshot"]


def test_import_drops_unknown_and_identifying_keys(team, stub):
    record = import_record(team.doctor, "RC500030").json()
    assert "patient_name" not in record["values"]
    assert "patient_name" not in record["hospital_snapshot"]


def test_bad_enum_from_hospital_shows_as_field_error(team, stub):
    stub.edit("RC500004", "import_patient", sex="x")
    record = import_record(team.doctor, "RC500004").json()
    assert record["values"]["sex"] == "x"
    assert "sex" in {e["path"] for e in record["errors"]}


def test_a_treatment_form_imports_its_own_values(team, stub):
    record = import_record(team.doctor, "RC500003", form="treatment").json()
    assert record["hospital_snapshot"] == stub.values("RC500003", "treatment")


class Down:
    def list_patients(self):
        raise HospitalUnavailable("down")

    def get_values(self, rc, form):
        raise HospitalUnavailable("down")

    def update(self, rc, form, set_values, expect):
        raise HospitalUnavailable("down")


def test_hospital_down_gives_503(app, team):
    app.state.hospital = Down()
    listed = team.doctor.get("/api/hospital/patients?form=import_patient")
    created = import_record(team.doctor, "RC500001")
    assert (listed.status_code, listed.json()["detail"]) == (503, DOWN)
    assert (created.status_code, created.json()["detail"]) == (503, DOWN)


def test_unknown_rc_gives_404(team, stub):
    r = import_record(team.doctor, "RC1")
    assert (r.status_code, r.json()["detail"]) == (404, UNKNOWN)


def test_from_hospital_on_a_photo_form_is_refused(team, stub):
    r = import_record(team.doctor, "RC500001", form="radiology_report")
    assert (r.status_code, r.json()["detail"]) == (422, "This form is not filled from the hospital")


def test_manual_creation_has_no_snapshot(team, stub):
    record = import_record(team.doctor, "RC9", from_hospital=False).json()
    assert record["hospital_snapshot"] is None
    assert record["hospital_sync"] is None


def test_the_patient_list_needs_a_login(client, templates):
    assert client.get("/api/hospital/patients?form=import_patient").status_code == 401
