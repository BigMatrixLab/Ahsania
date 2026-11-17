"""Sending an approved record back to the hospital system (design: "What is sent to the hospital").

New values (the hospital had none) and corrections (the hospital had another value) are sent; a correction
carries the value we imported as `expect`, so a value someone changed at the hospital meanwhile is never
overwritten: it comes back as a conflict for the admin. Blank answers are never sent.
"""

from collections.abc import Iterable
from typing import Any

from sqlalchemy.orm import Session

from capture.clock import utcnow
from capture.db.models import Record, ReviewEvent
from capture.formschema.store import template_def
from capture.hospital.client import Hospital, HospitalUnavailable, NotAtHospital


def _blank(value: Any) -> bool:
    return value is None or value == [] or (isinstance(value, str) and not value.strip())


def changes_for_hospital(snapshot: dict | None, values: dict, keys: Iterable[str]) -> tuple[dict, dict]:
    """Return (set_values, expect): what to write to the hospital, and what it should still hold for corrections."""
    set_values: dict[str, Any] = {}
    expect: dict[str, Any] = {}
    for key in keys:
        value = values.get(key)
        if _blank(value):
            continue
        old = None if snapshot is None else snapshot.get(key)
        if old is None:
            set_values[key] = value
        elif old != value:
            set_values[key] = value
            expect[key] = old
    return set_values, expect


def sync_record(db: Session, hospital: Hospital, record: Record, actor_id: int | None) -> None:
    """Send what the hospital lacks or has wrong; record how it went on the record and in its history."""
    definition = template_def(record.template)
    set_values, expect = changes_for_hospital(record.hospital_snapshot, record.field_values, [f.key for f in definition.fields])
    sync: dict[str, Any] = {"status": "nothing_to_send", "at": utcnow().isoformat(), "sent": [], "conflicts": [], "error": None}
    if set_values:
        try:
            result = hospital.update(record.reg_no, definition.key, set_values, expect)
        except HospitalUnavailable as e:
            sync.update(status="unavailable", error=str(e)[:500])
        except NotAtHospital:
            sync.update(status="not_at_hospital")
        except Exception as e:  # never lose the result: the admin sees it and can try again
            sync.update(status="unavailable", error=f"{type(e).__name__}: {e}"[:500])
        else:
            snapshot = dict(record.hospital_snapshot or {})
            for key in result.applied:
                snapshot[key] = set_values[key]
            record.hospital_snapshot = snapshot
            conflicts = [
                {"key": c["key"], "hospital_value": c.get("hospital_value"), "ours": set_values.get(c["key"]), "imported": expect.get(c["key"])}
                for c in result.conflicts
            ]
            sync.update(status="conflict" if conflicts else "sent", sent=list(result.applied), conflicts=conflicts)
    record.hospital_sync = sync
    record.row_version += 1
    comment = f"{sync['status']}: {len(sync['sent'])} sent" + (f", {len(sync['conflicts'])} conflicts" if sync["conflicts"] else "")
    db.add(ReviewEvent(record_id=record.id, actor_id=actor_id, action="sync", comment=comment))
