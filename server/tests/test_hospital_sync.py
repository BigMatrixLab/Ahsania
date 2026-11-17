from capture.hospital.sync import changes_for_hospital
from test_hospital_import import Down, import_record, stub  # noqa: F401  (stub is a fixture)

REQUIRED = {"visit_date": "2026-10-01", "age_years": 62, "sex": "male", "smoking_status": "current", "ecog": "1"}


# --- what gets sent ---


def test_new_values_are_sent_without_expect():
    assert changes_for_hospital({"sex": "male"}, {"sex": "male", "education": "primary"}, ["sex", "education"]) == (
        {"education": "primary"},
        {},
    )


def test_corrections_carry_the_old_value():
    assert changes_for_hospital({"age_years": 56}, {"age_years": 58}, ["age_years"]) == ({"age_years": 58}, {"age_years": 56})


def test_blanks_are_never_sent():
    assert changes_for_hospital({"age_years": 56}, {"age_years": None, "notes": ""}, ["age_years", "notes"]) == ({}, {})


def test_unchanged_values_are_not_sent():
    assert changes_for_hospital({"sex": "male", "ecog": "1"}, {"sex": "male", "ecog": "1"}, ["sex", "ecog"]) == ({}, {})


def test_manual_records_send_every_filled_value():
    assert changes_for_hospital(None, {"sex": "male", "notes": None}, ["sex", "notes"]) == ({"sex": "male"}, {})


def test_keys_outside_the_form_are_not_sent():
    assert changes_for_hospital({}, {"sex": "male", "other": 1}, ["sex"]) == ({"sex": "male"}, {})


# --- through the app ---


def imported(team, rc="RC500001"):
    return import_record(team.doctor, rc).json()


def save(team, record, **changes):
    values = {**REQUIRED, **record["values"], **changes}
    r = team.doctor.patch(f"/api/records/{record['id']}/values", json={"row_version": record["row_version"], "values": values})
    assert r.status_code == 200, r.text
    return r.json()


def submit(team, record):
    r = team.doctor.post(f"/api/records/{record['id']}/transition", json={"action": "submit", "row_version": record["row_version"]})
    assert r.status_code == 200, r.text
    return r.json()


def approve(team, record):
    r = team.admin.post(f"/api/records/{record['id']}/transition", json={"action": "approve", "row_version": record["row_version"]})
    assert r.status_code == 200, r.text
    return team.admin.get(f"/api/records/{record['id']}").json()


def blank_key(stub, rc="RC500001"):
    """A key the hospital lacks for this patient, that takes a free choice."""
    have = stub.values(rc)
    return next(k for k in ("education", "pollution_source", "tumor_location", "pdl1_method") if k not in have)


def test_approval_sends_new_values_and_corrections(team, stub):
    record = imported(team)
    new_key = blank_key(stub)
    choice = {"education": "primary", "pollution_source": "other", "tumor_location": "central", "pdl1_method": "IHC"}[new_key]
    old_age = record["values"]["age_years"]
    done = approve(team, submit(team, save(team, record, **{new_key: choice, "age_years": old_age + 1})))
    hospital = stub.values("RC500001")
    assert hospital[new_key] == choice
    assert hospital["age_years"] == old_age + 1
    assert done["hospital_sync"]["status"] == "sent"
    assert set(done["hospital_sync"]["sent"]) >= {new_key, "age_years"}
    assert done["hospital_snapshot"]["age_years"] == old_age + 1


def test_nothing_is_sent_before_admin_approval(team, stub):
    record = imported(team)
    before = stub.values("RC500001")
    submit(team, save(team, record, age_years=record["values"]["age_years"] + 1))
    assert stub.values("RC500001") == before


def test_try_again_after_success_sends_nothing(team, stub):
    record = imported(team)
    done = approve(team, submit(team, save(team, record, age_years=record["values"]["age_years"] + 1)))
    again = team.admin.post(f"/api/records/{done['id']}/hospital-sync")
    assert again.status_code == 200, again.text
    assert again.json()["hospital_sync"]["status"] == "nothing_to_send"


def test_value_changed_at_hospital_becomes_conflict(team, stub):
    record = imported(team)
    new_key = blank_key(stub)
    choice = {"education": "primary", "pollution_source": "other", "tumor_location": "central", "pdl1_method": "IHC"}[new_key]
    old_age = record["values"]["age_years"]
    stub.edit("RC500001", "import_patient", age_years=old_age + 5)  # someone at the hospital changes it meanwhile
    done = approve(team, submit(team, save(team, record, **{new_key: choice, "age_years": old_age + 1})))
    sync = done["hospital_sync"]
    assert sync["status"] == "conflict"
    assert sync["conflicts"] == [{"key": "age_years", "hospital_value": old_age + 5, "ours": old_age + 1, "imported": old_age}]
    assert stub.values("RC500001")["age_years"] == old_age + 5
    assert stub.values("RC500001")[new_key] == choice


def conflicted(team, stub):
    record = imported(team)
    old_age = record["values"]["age_years"]
    stub.edit("RC500001", "import_patient", age_years=old_age + 5)
    return approve(team, submit(team, save(team, record, age_years=old_age + 1))), old_age


def test_keep_hospital_resolves_conflict(team, stub):
    done, old_age = conflicted(team, stub)
    r = team.admin.post(f"/api/records/{done['id']}/hospital-conflict", json={"key": "age_years", "keep": "hospital", "row_version": done["row_version"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["values"]["age_years"] == old_age + 5
    assert body["hospital_sync"]["conflicts"] == []
    assert body["hospital_sync"]["status"] == "sent"
    assert body["events"][-1]["field_changes"]


def test_keep_ours_overwrites_after_resolution(team, stub):
    done, old_age = conflicted(team, stub)
    r = team.admin.post(f"/api/records/{done['id']}/hospital-conflict", json={"key": "age_years", "keep": "ours", "row_version": done["row_version"]})
    assert r.status_code == 200, r.text
    assert r.json()["hospital_sync"]["status"] in ("sent", "nothing_to_send")
    assert r.json()["hospital_sync"]["conflicts"] == []
    assert stub.values("RC500001")["age_years"] == old_age + 1


def test_hospital_down_on_approval_marks_unavailable_and_try_again_works(app, team, stub):
    record = imported(team)
    real = app.state.hospital
    app.state.hospital = Down()
    done = approve(team, submit(team, save(team, record, age_years=record["values"]["age_years"] + 1)))
    assert done["hospital_sync"]["status"] == "unavailable"
    app.state.hospital = real
    again = team.admin.post(f"/api/records/{done['id']}/hospital-sync").json()
    assert again["hospital_sync"]["status"] == "sent"


def test_a_manual_record_for_an_unknown_rc_is_not_at_hospital(team, stub):
    record = import_record(team.doctor, "RC9", from_hospital=False).json()
    done = approve(team, submit(team, save(team, record)))
    assert done["hospital_sync"]["status"] == "not_at_hospital"


def test_photo_records_never_sync(team, approved):
    assert approved({"modality": "CT", "study_date": "2026-09-01"})["hospital_sync"] is None


def test_only_admin_can_retry_or_resolve(team, stub):
    done, _ = conflicted(team, stub)
    assert team.doctor.post(f"/api/records/{done['id']}/hospital-sync").status_code == 403
    r = team.doctor.post(f"/api/records/{done['id']}/hospital-conflict", json={"key": "age_years", "keep": "hospital", "row_version": done["row_version"]})
    assert r.status_code == 403


def test_retry_only_on_approved_hospital_records(team, stub):
    record = imported(team)
    assert team.admin.post(f"/api/records/{record['id']}/hospital-sync").status_code == 409


def test_each_send_is_in_the_history(team, stub):
    record = imported(team)
    done = approve(team, submit(team, save(team, record, age_years=record["values"]["age_years"] + 1)))
    assert done["events"][-1]["action"] == "sync"
    assert done["events"][-1]["comment"].startswith("sent")
