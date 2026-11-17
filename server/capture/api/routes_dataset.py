import logging
import os
import tempfile
from collections import defaultdict
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.engine import Row
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from capture.api.deps import current_user, get_db, get_settings, require_roles
from capture.api.schemas import PatientDetail, PatientSummary
from capture.clock import utcnow
from capture.config import Settings
from capture.db.models import Record, Role, Status, Template, User
from capture.records.export import write_export
from capture.records.pairing import StudyRow, pairing_of
from capture.records.service import summaries

router = APIRouter(tags=["dataset"])
audit = logging.getLogger("capture.audit")
FIRST_VISIT_FORMS = ("import_patient", "new_patient_lung")  # the profile comes from the first-visit form
PROFILE_FIELDS = ("age_years", "sex", "smoking_status", "pack_years", "ecog", "histology", "stage_group")


def _rows(db: Session, reg_no: str | None = None) -> list[Row]:
    stmt = (
        select(Record.reg_no, Record.status, Record.field_values, Record.document_date, Template.key, Template.kind)
        .join(Template, Record.template_id == Template.id)
        .where(Record.status != Status.DELETED)
    )
    if reg_no:
        stmt = stmt.where(Record.reg_no == reg_no)
    return list(db.execute(stmt))


def _summary(reg_no: str, rows: list[Row]) -> PatientSummary:
    """Pairs count approved records only, so this always agrees with what the export holds."""
    approved = [r for r in rows if r.status == Status.APPROVED]
    pairing = pairing_of(StudyRow(r.key, r.field_values, r.document_date) for r in approved)
    form = next((r for r in rows if r.key in FIRST_VISIT_FORMS), None)
    profile = {k: form.field_values[k] for k in PROFILE_FIELDS if form.field_values.get(k) is not None} if form else None
    return PatientSummary(reg_no=reg_no, record_count=len(rows), approved_count=len(approved), profile=profile, **asdict(pairing))


@router.get("/patients", response_model=list[PatientSummary])
def list_patients(_: User = Depends(current_user), db: Session = Depends(get_db)) -> list[PatientSummary]:
    by_patient: dict[str, list[Row]] = defaultdict(list)
    for row in _rows(db):
        by_patient[row.reg_no].append(row)
    ordered = sorted(by_patient.items(), key=lambda item: (len(item[0]), item[0]))  # RC9 before RC100
    return [_summary(reg_no, rows) for reg_no, rows in ordered]


@router.get("/patients/{reg_no}", response_model=PatientDetail)
def get_patient(reg_no: str, _: User = Depends(current_user), db: Session = Depends(get_db)) -> PatientDetail:
    normal = "".join(reg_no.split()).upper()
    rows = _rows(db, normal)
    if not rows:
        raise HTTPException(status_code=404, detail="Patient not found")
    records = db.scalars(
        select(Record)
        .where(Record.reg_no == normal, Record.status != Status.DELETED)
        .order_by(Record.document_date.asc().nulls_last(), Record.created_at)
    )
    return PatientDetail(**_summary(normal, rows).model_dump(), records=summaries(db, list(records)))


@router.get("/export")
def export(
    user: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Build the ZIP in a temporary file beside the stored photos, send it, then remove it."""
    now = utcnow()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    handle, path = tempfile.mkstemp(prefix="export-", suffix=".zip", dir=settings.storage_dir)
    try:
        with os.fdopen(handle, "wb") as out:
            count = write_export(db, settings, out, now)
    except Exception:
        os.unlink(path)
        raise
    audit.warning("export of %s approved records by user %s", count, user.id)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"export-{now:%Y%m%d-%H%M%S}.zip",
        headers={"Cache-Control": "private, no-store"},
        background=BackgroundTask(os.unlink, path),
    )
