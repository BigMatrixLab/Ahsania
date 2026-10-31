import csv
import hashlib
import io
import json
import zipfile
from pathlib import PurePosixPath

from capture.db.models import Template
from capture.formschema.store import get_active
from constants import JPEG

REPORT = {
    "modality": "CT",
    "study_date": "2026-01-10",
    "lesions": [{"lobe": "RUL", "long_axis_cm": 2.3, "description": "spiculated"}, {"lobe": "LLL", "long_axis_cm": 1.1}],
    "impression": "Suspicious.",
}
CT_FILM = {"modality": "CT", "study_date": "2026-01-10", "capture_source": "printout"}
XRAY = {"study_date": "2026-03-01", "view": "PA", "capture_source": "printout"}


def download(client) -> zipfile.ZipFile:
    r = client.get("/api/export")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    return zipfile.ZipFile(io.BytesIO(r.content))


def member(archive: zipfile.ZipFile, name: str) -> bytes:
    """A file by its path inside the export's top folder."""
    [full] = [n for n in archive.namelist() if n.split("/", 1)[1] == name]
    return archive.read(full)


def rows(archive: zipfile.ZipFile, name: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(member(archive, name).decode("utf-8-sig"))))


def manifest(archive: zipfile.ZipFile) -> dict:
    return json.loads(member(archive, "manifest.json"))


def records(archive: zipfile.ZipFile) -> list[dict]:
    return json.loads(member(archive, "records.json"))


def test_only_approved_records_are_exported(team, upload, approved):
    done = approved(REPORT)
    upload(team.doctor, reg_no="RC2")
    archive = download(team.admin)
    assert [r["record_id"] for r in records(archive)] == [done["id"]]
    assert manifest(archive)["record_count"] == 1


def test_a_doctor_cannot_export(team):
    assert team.doctor.get("/api/export").status_code == 403


def test_the_form_csv_has_one_row_per_record_with_the_forms_columns(team, approved):
    done = approved(REPORT, reg_no="RC55")
    [row] = rows(download(team.admin), "radiology_report.csv")
    assert row["record_id"] == done["id"]
    assert (row["reg_no"], row["template_version"], row["document_date"]) == ("RC55", "1", "2026-01-10")
    assert (row["modality"], row["impression"]) == ("CT", "Suspicious.")
    assert row["lymph_nodes"] == ""  # a column for every field of the form, filled in or not
    assert "lesions" not in row


def test_a_true_or_false_field_reads_as_true_or_false(team, approved):
    approved(dict(REPORT, contrast=True))
    approved(dict(REPORT, contrast=False))
    assert sorted(r["contrast"] for r in rows(download(team.admin), "radiology_report.csv")) == ["false", "true"]


def test_repeating_fields_get_their_own_csv_keyed_by_record(team, approved):
    done = approved(REPORT, reg_no="RC55")
    lesions = rows(download(team.admin), "radiology_report__lesions.csv")
    assert [(r["record_id"], r["reg_no"], r["item"], r["lobe"], r["long_axis_cm"], r["description"]) for r in lesions] == [
        (done["id"], "RC55", "1", "RUL", "2.3", "spiculated"),
        (done["id"], "RC55", "2", "LLL", "1.1", ""),
    ]


def test_records_json_keeps_the_nested_values(team, approved):
    approved(REPORT, reg_no="RC55")
    [record] = records(download(team.admin))
    assert record["values"] == REPORT
    assert (record["reg_no"], record["template_key"], record["template_version"], record["document_date"]) == (
        "RC55",
        "radiology_report",
        1,
        "2026-01-10",
    )


def test_pages_are_in_the_zip_under_patient_and_record(team, approved):
    done = approved(REPORT, reg_no="RC55")
    archive = download(team.admin)
    assert member(archive, f"files/RC55/{done['id']}/page-1.jpg") == JPEG
    assert records(archive)[0]["files"] == [f"files/RC55/{done['id']}/page-1.jpg"]


def test_the_manifest_hashes_every_other_file(team, approved):
    approved(REPORT)
    archive = download(team.admin)
    book = manifest(archive)
    root = archive.namelist()[0].split("/", 1)[0]
    others = {n.split("/", 1)[1] for n in archive.namelist()} - {"manifest.json"}
    assert set(book["files"]) == others
    for name, digest in book["files"].items():
        assert hashlib.sha256(archive.read(f"{root}/{name}")).hexdigest() == digest
    assert book["templates"] == {"radiology_report": [1]}
    assert book["missing_files"] == []


def test_the_pairing_report_has_a_row_per_patient(team, approved):
    approved(CT_FILM, template_key="ct_mri_film_photo", reg_no="RC1")
    approved(XRAY, template_key="xray_film_photo", reg_no="RC1")
    approved(CT_FILM, template_key="ct_mri_film_photo", reg_no="RC2")
    report = {r["reg_no"]: r for r in rows(download(team.admin), "pairing_report.csv")}
    assert report["RC1"]["baseline_date"] == "2026-01-10"
    assert report["RC1"]["followup_xray_dates"] == "2026-03-01"
    assert report["RC1"]["interval_days"] == "50"
    assert report["RC1"]["paired"] == "yes"
    assert (report["RC2"]["followup_xray_dates"], report["RC2"]["paired"]) == ("", "no")


def test_the_pairing_report_joins_several_follow_ups(team, approved):
    approved(CT_FILM, template_key="ct_mri_film_photo")
    approved(XRAY, template_key="xray_film_photo")
    approved(dict(XRAY, study_date="2026-05-01"), template_key="xray_film_photo")
    [row] = rows(download(team.admin), "pairing_report.csv")
    assert row["followup_xray_dates"] == "2026-03-01;2026-05-01"
    assert row["interval_days"] == "50;111"


def test_with_nothing_approved_the_zip_is_still_valid(team, upload):
    upload(team.doctor)
    archive = download(team.admin)
    assert archive.testzip() is None
    assert manifest(archive)["record_count"] == 0
    assert records(archive) == []
    assert rows(archive, "pairing_report.csv") == []


def test_a_page_missing_from_disk_is_named_and_does_not_stop_the_export(team, approved, settings):
    done = approved(REPORT, reg_no="RC55")
    (settings.storage_dir / "records" / done["id"] / "page-1.jpg").unlink()
    book = manifest(download(team.admin))
    assert book["missing_files"] == [f"files/RC55/{done['id']}/page-1.jpg"]
    assert book["record_count"] == 1


def test_a_text_value_cannot_run_as_a_formula_in_the_csv(team, approved):
    approved(dict(REPORT, impression="=SUM(A1)", lymph_nodes="+ve", metastasis_sites="@x"))
    archive = download(team.admin)
    [row] = rows(archive, "radiology_report.csv")
    assert (row["impression"], row["lymph_nodes"], row["metastasis_sites"]) == ("'=SUM(A1)", "'+ve", "'@x")
    assert records(archive)[0]["values"]["impression"] == "=SUM(A1)"


def test_a_negative_number_stays_a_number_in_the_csv():
    from capture.records.export import cell

    assert cell(-2.5) == -2.5


def test_the_csv_opens_as_utf8_in_excel(team, approved):
    approved(dict(REPORT, impression="ফুসফুসের ক্যান্সার"))
    archive = download(team.admin)
    assert member(archive, "radiology_report.csv").startswith(b"\xef\xbb\xbf")
    assert rows(archive, "radiology_report.csv")[0]["impression"] == "ফুসফুসের ক্যান্সার"


def test_two_versions_of_a_form_share_one_csv_with_both_sets_of_columns(team, approved, db):
    approved(XRAY, template_key="xray_film_photo", reg_no="RC1")
    with db.begin() as s:
        old = get_active(s, "xray_film_photo")
        definition = json.loads(json.dumps(old.definition))
        definition["version"] = 2
        definition["fields"].append({"key": "technician_note", "type": "text"})
        s.add(Template(key=old.key, version=2, phase=old.phase, kind=old.kind, title=old.title, definition=definition))
    approved(dict(XRAY, technician_note="repeat view"), template_key="xray_film_photo", reg_no="RC2")
    archive = download(team.admin)
    by_patient = {r["reg_no"]: r for r in rows(archive, "xray_film_photo.csv")}
    assert (by_patient["RC1"]["technician_note"], by_patient["RC1"]["view"]) == ("", "PA")
    assert (by_patient["RC2"]["technician_note"], by_patient["RC2"]["template_version"]) == ("repeat view", "2")
    assert manifest(archive)["templates"] == {"xray_film_photo": [1, 2]}


def test_the_export_leaves_no_temporary_file_behind(team, approved, settings):
    approved(REPORT)
    download(team.admin)
    assert list(settings.storage_dir.glob("export-*")) == []


def test_export_paths_stay_under_the_top_folder(team, approved):
    approved(REPORT)
    names = download(team.admin).namelist()
    assert len({PurePosixPath(n).parts[0] for n in names}) == 1
    assert not any(".." in PurePosixPath(n).parts for n in names)
