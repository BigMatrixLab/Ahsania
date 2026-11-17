import csv
import io
import re
import uuid
import zipfile

import yaml
from sqlalchemy import select

from capture.clock import today
from capture.db.models import Job
from constants import JPEG, TEMPLATES_DIR

FORM = "import_patient"
FILLED = {"visit_date": "2026-10-01", "age_years": 62, "sex": "male", "smoking_status": "current", "ecog": "1"}


def start(client, upload, reg_no="RC1", **kwargs):
    return upload(client, template_key=FORM, reg_no=reg_no, pages=(), **kwargs)


def test_a_new_patient_record_opens_as_a_draft_with_no_photo(team, upload):
    r = start(team.doctor, upload)
    assert r.status_code == 201, r.text
    record = r.json()
    assert record["status"] == "draft"
    assert record["files"] == []
    assert record["extraction_status"] == "not_applicable"


def test_the_visit_date_starts_as_today(team, upload):
    record = start(team.doctor, upload).json()
    assert record["values"] == {"visit_date": today().isoformat()}
    assert record["document_date"] == today().isoformat()


def test_a_photo_is_refused_on_this_form(team, upload):
    r = upload(team.doctor, template_key=FORM, reg_no="RC1", pages=(JPEG,))
    assert r.status_code == 422
    assert r.json()["detail"] == "This form takes no photos"


def test_forms_read_from_a_photo_still_need_a_photo(team, upload):
    assert upload(team.doctor, template_key="radiology_report", pages=()).status_code == 422


def test_a_second_first_visit_form_for_one_patient_is_refused(team, upload):
    assert start(team.doctor, upload).status_code == 201
    r = start(team.doctor2, upload)
    assert r.status_code == 409
    assert r.json()["detail"] == "This patient already has this form"


def test_another_patient_can_have_their_own_form(team, upload):
    assert start(team.doctor, upload, reg_no="RC1").status_code == 201
    assert start(team.doctor, upload, reg_no="RC2").status_code == 201


def test_a_deleted_form_can_be_started_again(team, upload):
    record = start(team.doctor, upload).json()
    assert team.doctor.delete(f"/api/records/{record['id']}").status_code == 204
    assert start(team.doctor, upload).status_code == 201


def test_a_replayed_request_returns_the_same_record(team, upload):
    upload_id = str(uuid.uuid4())
    first = start(team.doctor, upload, client_upload_id=upload_id)
    second = start(team.doctor, upload, client_upload_id=upload_id)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]


def test_the_required_answers_block_approval_until_given(team, upload):
    record = start(team.doctor, upload).json()
    url = f"/api/records/{record['id']}"
    assert {e["path"] for e in record["errors"]} == {"age_years", "sex", "smoking_status", "ecog"}
    r = team.doctor.post(f"{url}/transition", json={"action": "submit", "row_version": record["row_version"]})
    assert r.status_code == 422
    saved = team.doctor.patch(f"{url}/values", json={"row_version": record["row_version"], "values": FILLED}).json()
    assert saved["errors"] == []
    r = team.doctor.post(f"{url}/transition", json={"action": "submit", "row_version": saved["row_version"]})
    assert r.json()["status"] == "pending_admin"


def test_an_age_out_of_range_is_flagged(team, upload):
    record = start(team.doctor, upload).json()
    values = {**FILLED, "age_years": 200}
    saved = team.doctor.patch(f"/api/records/{record['id']}/values", json={"row_version": record["row_version"], "values": values}).json()
    assert {"path": "age_years", "message": "must be at most 120"} in saved["errors"]


def test_no_job_is_queued_even_with_the_worker_on(db, ai_doctor, upload):
    assert start(ai_doctor, upload).json()["status"] == "draft"
    with db() as s:
        assert s.scalar(select(Job)) is None


def test_the_export_gets_one_flat_column_per_question(team, approved):
    approved({**FILLED, "symptom_cough": True, "histology": "adenocarcinoma"}, template_key=FORM, reg_no="RC1", pages=())
    archive = zipfile.ZipFile(io.BytesIO(team.admin.get("/api/export").content))
    [name] = [n for n in archive.namelist() if n.endswith(f"/{FORM}.csv")]
    [row] = list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))))
    assert (row["reg_no"], row["age_years"], row["symptom_cough"], row["histology"]) == ("RC1", "62", "true", "adenocarcinoma")
    assert row["symptom_blood"] == ""


def test_the_patient_list_shows_who_the_patient_is(team, upload, approved):
    approved({**FILLED, "histology": "adenocarcinoma", "stage_group": "IIIA", "notes": "x"}, template_key=FORM, reg_no="RC1", pages=())
    upload(team.doctor, reg_no="RC2")
    by_patient = {p["reg_no"]: p for p in team.admin.get("/api/patients").json()}
    assert by_patient["RC1"]["profile"] == {
        "age_years": 62,
        "sex": "male",
        "smoking_status": "current",
        "ecog": "1",
        "histology": "adenocarcinoma",
        "stage_group": "IIIA",
    }
    assert by_patient["RC2"]["profile"] is None


def test_a_first_visit_form_does_not_count_towards_a_pair(team, approved):
    approved(FILLED, template_key=FORM, reg_no="RC1", pages=())
    [patient] = team.admin.get("/api/patients").json()
    assert (patient["baseline"], patient["xrays"], patient["paired"]) == (None, [], False)


def test_the_form_asks_for_no_identifier():
    definition = yaml.safe_load((TEMPLATES_DIR / f"{FORM}.yaml").read_text(encoding="utf-8"))
    identifying = re.compile(r"name|phone|mobile|address|national|birth|\bnid\b", re.IGNORECASE)
    assert [f["key"] for f in definition["fields"] if identifying.search(f["key"]) or identifying.search(f.get("label", ""))] == []


NEW_FIELDS = {
    "pollution_source", "education",
    "smoking_start_age", "smoking_years", "sticks_per_day", "smoking_stop_age", "smokeless_type",
    "passive_smoke_years", "work_exposure_years", "biomass_years",
    "family_first_degree", "past_asthma", "past_pneumonia", "past_other_lung",
    "diagnosis_date", "symptom_fever", "symptom_other", "bmi",
    "tumor_side", "tumor_location", "primary_lesion_count", "histology_grade", "biopsy_type",
    "node_involved", "distant_mets", "met_other", "met_site_count",
    "molecular_tested", "mol_egfr", "mol_alk", "mol_ros1", "mol_kras", "mol_braf", "mol_met", "mol_ret", "mol_ntrk", "mol_her2",
    "pdl1_level", "pdl1_method", "molecular_method",
}
HOSPITAL_FORMS = ("import_patient", "treatment", "toxicity_outcome")


def definition(key):
    return yaml.safe_load((TEMPLATES_DIR / f"{key}.yaml").read_text(encoding="utf-8"))


def fields_of(key):
    return {f["key"]: f for f in definition(key)["fields"]}


def test_import_patient_has_every_new_field():
    assert len(NEW_FIELDS) == 40
    assert NEW_FIELDS <= set(fields_of(FORM))


def test_changed_options():
    fields = fields_of(FORM)
    assert fields["residence"]["options"] == ["urban", "rural", "semi-urban"]
    assert (fields["smokeless_tobacco"]["type"], fields["smokeless_tobacco"]["options"]) == ("enum", ["never", "current", "former"])
    assert {"M1c1", "M1c2"} <= set(fields["m_stage"]["options"])
    assert "multiple" in fields["primary_site"]["options"]


def test_met_fields_follow_distant_mets():
    mets = [f for k, f in fields_of(FORM).items() if k.startswith("met_") and k not in ("met_other", "met_site_count")]
    assert len(mets) == 5
    assert all(f["show_if"] == {"key": "distant_mets", "values": [True]} for f in mets)


def test_required_set():
    assert {k for k, f in fields_of(FORM).items() if f.get("required")} == {"visit_date", "age_years", "sex", "smoking_status", "ecog"}


def test_follow_up_forms_required():
    assert {k for k, f in fields_of("treatment").items() if f.get("required")} == {"treatment_date", "treatment_intent"}
    assert {k for k, f in fields_of("toxicity_outcome").items() if f.get("required")} == {"followup_date", "vital_status"}


def test_hospital_forms_are_flagged():
    flags = {k: (definition(k).get("hospital"), definition(k).get("repeats", False), definition(k)["phase"]) for k in HOSPITAL_FORMS}
    assert flags == {"import_patient": (True, False, 1), "treatment": (True, True, 1), "toxicity_outcome": (True, True, 1)}


def test_no_form_asks_for_an_identifier():
    identifying = re.compile(r"name|phone|mobile|address|national|birth|\bnid\b", re.IGNORECASE)

    def leaves(fields):
        for f in fields:
            yield f
            yield from leaves(f.get("fields", []))

    bad = [
        (key, f["key"])
        for key in HOSPITAL_FORMS
        for f in leaves(definition(key)["fields"])
        if identifying.search(f["key"]) or identifying.search(f.get("label", ""))
    ]
    assert bad == []


def test_old_first_visit_form_is_retired(team, upload):
    r = upload(team.doctor, template_key="new_patient_lung", reg_no="RC1", pages=())
    assert r.status_code == 410


def test_profile_ignores_treatment_records(team, approved):
    approved({"treatment_date": "2026-10-02", "treatment_intent": "palliative"}, template_key="treatment", reg_no="RC1", pages=())
    approved(FILLED, template_key=FORM, reg_no="RC1", pages=())
    [patient] = team.admin.get("/api/patients").json()
    assert patient["profile"]["age_years"] == 62
