CT_FILM = {"modality": "CT", "study_date": "2026-01-10", "capture_source": "printout"}
XRAY = {"study_date": "2026-03-01", "view": "PA", "capture_source": "printout"}


def test_a_patient_shows_their_pair(team, approved):
    approved(CT_FILM, template_key="ct_mri_film_photo", reg_no="RC1")
    approved(XRAY, template_key="xray_film_photo", reg_no="RC1")
    [patient] = team.admin.get("/api/patients").json()
    assert patient["reg_no"] == "RC1"
    assert (patient["record_count"], patient["approved_count"], patient["paired"]) == (2, 2, True)
    assert patient["baseline"] == {"date": "2026-01-10", "image": True, "report": False, "days_after_baseline": 0}
    assert patient["xrays"] == [{"date": "2026-03-01", "image": True, "report": False, "days_after_baseline": 50}]


def test_doctors_see_patients_too(team, approved):
    approved(CT_FILM, template_key="ct_mri_film_photo", reg_no="RC1")
    assert [p["reg_no"] for p in team.doctor.get("/api/patients").json()] == ["RC1"]
    assert team.doctor.get("/api/patients/RC1").status_code == 200


def test_a_pair_needs_both_sides_approved(team, upload, approved):
    approved(CT_FILM, template_key="ct_mri_film_photo", reg_no="RC1")
    draft = upload(team.doctor, template_key="xray_film_photo", reg_no="RC1").json()
    team.doctor.patch(f"/api/records/{draft['id']}/values", json={"row_version": draft["row_version"], "values": XRAY})
    [patient] = team.admin.get("/api/patients").json()
    assert (patient["record_count"], patient["approved_count"], patient["paired"]) == (2, 1, False)
    assert patient["xrays"] == []


def test_a_patient_page_lists_every_status_with_the_earliest_document_first(team, upload, approved):
    no_date = upload(team.doctor, template_key="xray_film_photo", reg_no="RC1").json()
    later = approved(XRAY, template_key="xray_film_photo", reg_no="RC1")
    earlier = approved(CT_FILM, template_key="ct_mri_film_photo", reg_no="RC1")
    detail = team.admin.get("/api/patients/RC1").json()
    assert [r["id"] for r in detail["records"]] == [earlier["id"], later["id"], no_date["id"]]
    assert [r["status"] for r in detail["records"]] == ["approved", "approved", "draft"]
    assert detail["paired"] is True


def test_a_deleted_record_never_counts(team, upload):
    record = upload(team.doctor, reg_no="RC1").json()
    assert team.doctor.delete(f"/api/records/{record['id']}").status_code == 204
    assert team.admin.get("/api/patients").json() == []
    assert team.admin.get("/api/patients/RC1").status_code == 404


def test_the_patient_id_can_be_typed_loosely(team, upload):
    upload(team.doctor, reg_no="RC123")
    assert team.admin.get("/api/patients/rc 123").json()["reg_no"] == "RC123"


def test_an_unknown_patient_is_404(team):
    assert team.admin.get("/api/patients/RC999").status_code == 404


def test_patients_are_listed_in_number_order(team, upload):
    for reg_no in ("RC100", "RC9", "RC20"):
        upload(team.doctor, reg_no=reg_no)
    assert [p["reg_no"] for p in team.admin.get("/api/patients").json()] == ["RC9", "RC20", "RC100"]
