from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from capture.api.deps import current_user, get_db, get_hospital
from capture.api.schemas import HospitalPatientOut
from capture.db.models import Record, Status, Template, User
from capture.hospital.client import DOWN_MESSAGE, HospitalUnavailable

router = APIRouter(tags=["hospital"])


@router.get("/hospital/patients", response_model=list[HospitalPatientOut])
def list_hospital_patients(
    form: str,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
    hospital=Depends(get_hospital),
) -> list[HospitalPatientOut]:
    """The hospital's patients, newest first, each marked when it already has a record of `form` here."""
    try:
        patients = hospital.list_patients()
    except HospitalUnavailable:
        raise HTTPException(status_code=503, detail=DOWN_MESSAGE) from None
    imported = set(
        db.scalars(
            select(Record.reg_no)
            .join(Template, Record.template_id == Template.id)
            .where(Template.key == form, Record.status != Status.DELETED)
        )
    )
    return [HospitalPatientOut(rc=p.rc, imported=p.rc in imported) for p in patients]
