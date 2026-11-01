"""Made-up sample patients for showing the app. Every photo comes from eval/golden and is marked SYNTHETIC."""

import json
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from capture.config import Settings
from capture.db.models import Record, ReviewEvent, Status, User
from capture.extraction.assemble import conform
from capture.formschema.store import get_active, template_def
from capture.formschema.validate import document_date_of
from capture.records.service import create_record

GOLDEN = Path(__file__).resolve().parents[2] / "eval" / "golden"
CT, XRAY, REPORT, FIRST_VISIT = "ct_mri_film_photo", "xray_film_photo", "radiology_report", "new_patient_lung"

_SMOKER = {"visit_date": "2025-01-28", "age_years": 58, "sex": "male", "residence": "rural area", "occupation": "farmer", "smoking_status": "current", "tobacco_type": "bidi", "pack_years": 35, "ecog": "1", "symptom_cough": True, "symptom_blood": True, "symptom_weeks": 10, "past_tb": True, "diagnosis_status": "confirmed by biopsy or cytology", "histology": "adenocarcinoma", "primary_site": "RUL", "stage_group": "IIIA", "treatment_intent": "curative", "plan_chemotherapy": True, "plan_radiotherapy": True}
_NON_SMOKER = {"visit_date": "2026-04-05", "age_years": 64, "sex": "female", "residence": "rural area", "occupation": "homemaker", "smoking_status": "never", "biomass_fuel": True, "ecog": "0", "symptom_cough": True, "diagnosis_status": "suspected", "histology": "not yet known"}
_FORMER = {"visit_date": "2026-06-01", "age_years": 71, "sex": "male", "smoking_status": "former", "tobacco_type": "cigarette", "pack_years": 40, "years_since_quit": 6, "ecog": "2", "histology": "squamous cell carcinoma", "stage_group": "IVA"}

# Patient ID -> (form, golden case or None, values for a form with no photo).
PATIENTS: dict[str, list[tuple[str, str | None, dict[str, Any] | None]]] = {
    "RC100001": [(FIRST_VISIT, None, _SMOKER), (CT, "case-03", None), (XRAY, "case-01", None)],
    "RC100002": [(FIRST_VISIT, None, _NON_SMOKER), (CT, "case-02", None), (XRAY, "case-02", None)],
    "RC100003": [(FIRST_VISIT, None, _FORMER), (CT, "case-01", None), (XRAY, "case-04", None)],
    "RC100004": [(CT, "case-04", None)],
    "RC100005": [(XRAY, "case-03", None)],
    "RC100006": [(REPORT, "case-01", None)],
}


def seed_demo(sessions: sessionmaker, settings: Settings) -> int:
    """Add the sample patients, approved, to a database with no records. Returns how many records were added."""
    added = 0
    with sessions.begin() as db:
        if db.scalar(select(func.count()).select_from(Record)):
            return 0
        doctor = db.scalar(select(User).where(User.username == "doctor"))
        admin = db.scalar(select(User).where(User.username == "admin"))
        for reg_no, items in PATIENTS.items():
            for key, case, form_values in items:
                folder = GOLDEN / key / case if case else None
                pages = [(folder / "page-1.jpg").read_bytes()] if folder else []
                record, _ = create_record(db, settings, doctor, reg_no=reg_no, template_key=key, client_upload_id=uuid.uuid4(), fill_by_hand=True, pages=pages)
                tpl = template_def(get_active(db, key))
                if folder:
                    values = conform(tpl, json.loads((folder / "expected.json").read_text(encoding="utf-8"))["values"])
                    if key != REPORT:
                        values["capture_source"] = "lightbox film"
                else:
                    values = form_values
                record.field_values = values
                record.document_date = document_date_of(tpl, values)
                record.status = Status.APPROVED
                db.add(ReviewEvent(record_id=record.id, actor_id=doctor.id, action="submit"))
                db.add(ReviewEvent(record_id=record.id, actor_id=admin.id, action="approve"))
                added += 1
    return added
