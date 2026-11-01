from capture.demo import seed_demo


def test_sample_patients_cover_every_state_a_board_should_see(db, settings, team, make_user, login_as):
    make_user("doctor", username="doctor")
    make_user("admin", username="admin")
    assert seed_demo(db, settings) > 0
    patients = {p["reg_no"]: p for p in team.admin.get("/api/patients").json()}
    assert sum(p["paired"] for p in patients.values()) == 3
    assert patients["RC100001"]["profile"]["histology"] == "adenocarcinoma"
    assert not patients["RC100004"]["paired"] and patients["RC100004"]["baseline"] is not None
    assert not patients["RC100005"]["paired"] and patients["RC100005"]["baseline"] is None
    assert patients["RC100006"]["baseline"]["image"] is False
    records = team.admin.get("/api/records").json()
    assert {r["status"] for r in records} == {"approved"}


def test_seeding_twice_adds_nothing(db, settings, team, make_user):
    make_user("doctor", username="doctor")
    make_user("admin", username="admin")
    first = seed_demo(db, settings)
    assert first > 0
    assert seed_demo(db, settings) == 0
    assert len(team.admin.get("/api/records").json()) == first


def test_sample_photos_are_really_stored(db, settings, team, make_user):
    make_user("doctor", username="doctor")
    make_user("admin", username="admin")
    seed_demo(db, settings)
    film = next(r for r in team.admin.get("/api/patients/RC100001").json()["records"] if r["template_key"] == "xray_film_photo")
    [page] = team.admin.get(f"/api/records/{film['id']}").json()["files"]
    assert team.admin.get(f"/api/files/{page['id']}").status_code == 200
