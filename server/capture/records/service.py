import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from capture.api.convert import record_detail, record_summary
from capture.api.schemas import RecordDetail, RecordSummary
from capture.app_settings import load_app_settings
from capture.clock import today
from capture.config import Settings
from capture.db.models import ExtractionStatus, Patient, Record, RecordFile, ReviewEvent, Status, Template, User
from capture.formschema.store import get_active, template_def
from capture.formschema.validate import document_date_of, validate_values
from capture.hospital.client import DOWN_MESSAGE, UNKNOWN_MESSAGE, Hospital, HospitalUnavailable, NotAtHospital
from capture.jobqueue import queue_extraction, queued_at
from capture.jpeg import HAS_METADATA, check_jpeg
from capture.storage import save_page

METADATA_MESSAGE = "Pages must not contain photo metadata (EXIF/XMP) — re-capture the photo in the app"
CONFLICT_MESSAGE = "Someone else changed this record — reload"


class UploadRejected(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def _check_pages(settings: Settings, pages: list[bytes]) -> None:
    if not 1 <= len(pages) <= settings.max_pages:
        raise UploadRejected(422, f"Upload between 1 and {settings.max_pages} pages")
    for data in pages:
        if len(data) > settings.max_page_bytes:
            raise UploadRejected(413, f"Each page must be at most {settings.max_page_bytes // (1024 * 1024)} MB")
        try:
            check_jpeg(data)
        except ValueError as e:
            if str(e) == HAS_METADATA:
                raise UploadRejected(422, METADATA_MESSAGE) from None
            raise UploadRejected(415, "Pages must be JPEG images") from None


def _hospital_values(hospital: Hospital, reg_no: str, form: str, keys: set[str]) -> dict:
    """What the hospital holds for this patient and form, limited to the form's own questions.

    Anything else the hospital sends (a name, a key we do not ask) is dropped here and never stored.
    """
    try:
        values = hospital.get_values(reg_no, form)
    except HospitalUnavailable:
        raise UploadRejected(503, DOWN_MESSAGE) from None
    except NotAtHospital:
        raise UploadRejected(404, UNKNOWN_MESSAGE) from None
    return {k: v for k, v in values.items() if k in keys and v is not None}


def _has_form(db: Session, reg_no: str, template_key: str) -> bool:
    stmt = (
        select(Record.id)
        .join(Template, Record.template_id == Template.id)
        .where(Record.reg_no == reg_no, Template.key == template_key, Record.status != Status.DELETED)
        .limit(1)
    )
    return db.scalar(stmt) is not None


def create_record(
    db: Session,
    settings: Settings,
    user: User,
    *,
    reg_no: str,
    template_key: str,
    client_upload_id: uuid.UUID,
    fill_by_hand: bool,
    pages: list[bytes],
    from_hospital: bool = False,
    hospital: Hospital | None = None,
) -> tuple[Record, bool]:
    """Validate an upload, store its pages and create the record. Nothing is written on rejection.

    Returns (record, created). A replay of an earlier upload by the same user returns that record unchanged.
    With fill_by_hand the record opens as a draft at once and the AI never reads it. A form has no pages at all:
    it opens as a draft dated today, and a patient has one of each unless the form repeats. With from_hospital
    the form opens filled with what the hospital system holds for the patient, kept as the record's snapshot.
    """
    template = get_active(db, template_key)
    if template is None:
        raise UploadRejected(404, "Unknown form type")
    definition = template_def(template)
    if definition.retired:
        raise UploadRejected(410, "This form is no longer used")
    existing = db.scalar(select(Record).where(Record.client_upload_id == client_upload_id))
    if existing is not None:
        if existing.created_by == user.id:
            return existing, False
        raise UploadRejected(409, "This upload ID is already in use")
    if template.kind == "dicom":
        raise UploadRejected(422, "Use the DICOM upload for this form")
    if template.phase == 3 and not load_app_settings(db).phase3_enabled:
        raise UploadRejected(403, "Locked until Phase 3")
    is_form = template.kind == "form"
    if from_hospital and not (is_form and definition.hospital and hospital is not None):
        raise UploadRejected(422, "This form is not filled from the hospital")
    if not is_form:
        _check_pages(settings, pages)
    elif pages:
        raise UploadRejected(422, "This form takes no photos")
    elif not definition.repeats and _has_form(db, reg_no, template.key):
        raise UploadRejected(409, "This patient already has this form")
    snapshot = None
    if from_hospital:
        snapshot = _hospital_values(hospital, reg_no, template.key, {f.key for f in definition.fields})

    db.execute(pg_insert(Patient).values(reg_no=reg_no).on_conflict_do_nothing())
    record = Record(
        id=uuid.uuid4(),
        reg_no=reg_no,
        template_id=template.id,
        status=Status.DRAFT,
        extraction_status=ExtractionStatus.NOT_APPLICABLE,
        field_values={},
        created_by=user.id,
        client_upload_id=client_upload_id,
    )
    db.add(record)
    db.flush()
    for page_no, data in enumerate(pages, start=1):
        relative, digest = save_page(settings.storage_dir, record.id, page_no, data)
        db.add(RecordFile(record_id=record.id, kind="page", path=relative, sha256=digest, size=len(data), page_no=page_no))
    if is_form:
        values = {definition.document_date_key: today().isoformat(), **(snapshot or {})}
        record.field_values = values
        record.hospital_snapshot = snapshot
        record.document_date = document_date_of(definition, values)
    elif fill_by_hand:
        record.extraction_status = ExtractionStatus.SKIPPED
    else:
        queue_extraction(db, settings, record)
    db.add(ReviewEvent(record_id=record.id, actor_id=user.id, action="import" if from_hospital else "upload"))
    db.flush()
    return record, True


def load_events(db: Session, record_id: uuid.UUID) -> list[ReviewEvent]:
    stmt = select(ReviewEvent).where(ReviewEvent.record_id == record_id).order_by(ReviewEvent.id)
    return list(db.scalars(stmt))


def duplicates_of(db: Session, record: Record) -> list[uuid.UUID]:
    """Other records of the same patient sharing a page photo."""
    hashes = select(RecordFile.sha256).where(RecordFile.record_id == record.id)
    stmt = (
        select(Record.id, Record.status, Record.created_at)
        .join(RecordFile, RecordFile.record_id == Record.id)
        .where(Record.reg_no == record.reg_no, Record.id != record.id, RecordFile.sha256.in_(hashes))
        .distinct()
    )
    return [row.id for row in sorted(db.execute(stmt), key=lambda row: row.created_at)]


def detail_for(db: Session, record: Record) -> RecordDetail:
    errors = validate_values(template_def(record.template), record.field_values, today())
    phase3_enabled = load_app_settings(db).phase3_enabled
    since = queued_at(db, record.id) if record.status == Status.PROCESSING else None
    return record_detail(
        record,
        load_events(db, record.id),
        errors,
        phase3_enabled,
        duplicates_of(db, record),
        since,
    )


def summaries(db: Session, records: list[Record]) -> list[RecordSummary]:
    ids = [r.id for r in records]
    latest = last_events(db, ids)
    sent = sent_to_admin(db, ids)
    return [record_summary(r, latest.get(r.id), r.id in sent) for r in records]


def sent_to_admin(db: Session, record_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """The records that have been sent to the admin at least once (one query)."""
    if not record_ids:
        return set()
    stmt = select(ReviewEvent.record_id).where(ReviewEvent.record_id.in_(record_ids), ReviewEvent.action == "submit")
    return set(db.scalars(stmt))


def last_events(db: Session, record_ids: list[uuid.UUID]) -> dict[uuid.UUID, ReviewEvent]:
    """The newest review event of each record (one query)."""
    if not record_ids:
        return {}
    stmt = (
        select(ReviewEvent)
        .where(ReviewEvent.record_id.in_(record_ids))
        .order_by(ReviewEvent.record_id, ReviewEvent.id.desc())
        .ext(distinct_on(ReviewEvent.record_id))
    )
    return {event.record_id: event for event in db.scalars(stmt)}
