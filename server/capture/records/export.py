"""The dataset NSU downloads (spec §10): approved records only, in one ZIP with a manifest of SHA-256 hashes.

Forms get CSV files with one column per field. A repeating group nested inside another repeating group
has no column; no form has one today, and records.json always holds the full values.
"""

import csv
import hashlib
import io
import json
import zipfile
from collections import defaultdict
from datetime import datetime
from typing import Any, BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from capture.config import Settings
from capture.db.models import Record, Status
from capture.formschema.diff import flatten
from capture.formschema.model import GroupField
from capture.formschema.store import template_def
from capture.records.pairing import StudyRow, pairing_of
from capture.storage import resolve_in_storage

FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
CSV_NOTE = "In the CSV files a text value starting with = + - or @ has a leading ' so that Excel will not run it. records.json holds it unchanged."


def cell(value: Any) -> Any:
    """A value for a CSV cell: blank for nothing, and text that Excel would run as a formula made harmless."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str) and value.startswith(FORMULA_START):
        return f"'{value}"
    return value


def _csv(columns: list[str], rows: list[list[Any]]) -> bytes:
    """UTF-8 with a byte-order mark, so Excel shows Bangla text correctly."""
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(columns)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8-sig")


def _columns(fields: list, prefix: str = "") -> list[str]:
    """Paths of the fields that fit in one column."""
    paths: list[str] = []
    for f in fields:
        path = f"{prefix}{f.key}"
        if not isinstance(f, GroupField):
            paths.append(path)
        elif not f.repeat:
            paths.extend(_columns(f.fields, f"{path}."))
    return paths


def _unique(lists: list[list[str]]) -> list[str]:
    return list(dict.fromkeys(item for items in lists for item in items))


def _form_tables(key: str, records: list[Record]) -> dict[str, bytes]:
    """<form>.csv with a row per record and <form>__<group>.csv with a row per group item. All versions share them."""
    definitions = [template_def(t) for _, t in sorted({r.template.version: r.template for r in records}.items())]
    columns = _unique([_columns(d.fields) for d in definitions])
    rows = [
        [r.id, r.reg_no, r.template.version, r.document_date or "", *(cell(flatten(r.field_values).get(c)) for c in columns)]
        for r in records
    ]
    tables = {f"{key}.csv": _csv(["record_id", "reg_no", "template_version", "document_date", *columns], rows)}

    groups: dict[str, list[list[str]]] = defaultdict(list)
    for definition in definitions:
        for f in definition.fields:
            if isinstance(f, GroupField) and f.repeat:
                groups[f.key].append(_columns(f.fields))
    for group, lists in groups.items():
        group_columns = _unique(lists)
        items = [
            [r.id, r.reg_no, number, *(cell(flatten(item).get(c)) for c in group_columns)]
            for r in records
            for number, item in enumerate(r.field_values.get(group) or [], start=1)
        ]
        tables[f"{key}__{group}.csv"] = _csv(["record_id", "reg_no", "item", *group_columns], items)
    return tables


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def _pairing_report(records: list[Record]) -> bytes:
    by_patient: dict[str, list[StudyRow]] = defaultdict(list)
    for r in records:
        by_patient[r.reg_no].append(StudyRow(r.template.key, r.field_values, r.document_date))
    rows = []
    for reg_no, studies in sorted(by_patient.items(), key=lambda item: (len(item[0]), item[0])):
        pairing = pairing_of(studies)
        base = pairing.baseline
        rows.append(
            [
                reg_no,
                base.date.isoformat() if base else "",
                _yes_no(bool(base and base.image)),
                _yes_no(bool(base and base.report)),
                ";".join(x.date.isoformat() for x in pairing.xrays),
                ";".join(str(x.days_after_baseline) for x in pairing.xrays if x.days_after_baseline is not None),
                sum(x.image for x in pairing.xrays),
                _yes_no(pairing.paired),
            ]
        )
    columns = [
        "reg_no",
        "baseline_date",
        "baseline_image",
        "baseline_report",
        "followup_xray_dates",
        "interval_days",
        "followup_xrays_with_image",
        "paired",
    ]
    return _csv(columns, rows)


def write_export(db: Session, settings: Settings, out: BinaryIO, now: datetime) -> int:
    """Write the ZIP to `out` and return how many records it holds. A stored file missing from disk is named in the manifest."""
    records = list(
        db.scalars(
            select(Record)
            .where(Record.status == Status.APPROVED)
            .options(selectinload(Record.files))
            .order_by(Record.reg_no, Record.document_date, Record.created_at)
        )
    )
    root = f"export-{now:%Y%m%d-%H%M%S}"
    hashes: dict[str, str] = {}
    missing: list[str] = []
    listing: list[dict[str, Any]] = []
    with zipfile.ZipFile(out, "w") as archive:

        def add(name: str, data: bytes, method: int = zipfile.ZIP_DEFLATED) -> None:
            archive.writestr(f"{root}/{name}", data, compress_type=method)
            hashes[name] = hashlib.sha256(data).hexdigest()

        by_form: dict[str, list[Record]] = defaultdict(list)
        for record in records:
            by_form[record.template.key].append(record)
        for key, form_records in by_form.items():
            for name, data in _form_tables(key, form_records).items():
                add(name, data)
        add("pairing_report.csv", _pairing_report(records))

        for record in records:
            names = []
            for stored in record.files:
                name = f"files/{record.reg_no}/{record.id}/{stored.path.split(f'{record.id}/', 1)[1]}"
                names.append(name)
                try:
                    data = resolve_in_storage(settings.storage_dir, stored.path).read_bytes()
                except OSError:
                    missing.append(name)
                    continue
                add(name, data, zipfile.ZIP_STORED if name.endswith(".jpg") else zipfile.ZIP_DEFLATED)
            listing.append(
                {
                    "record_id": str(record.id),
                    "reg_no": record.reg_no,
                    "template_key": record.template.key,
                    "template_version": record.template.version,
                    "document_date": record.document_date.isoformat() if record.document_date else None,
                    "values": record.field_values,
                    "files": names,
                }
            )
        add("records.json", json.dumps(listing, ensure_ascii=False, indent=2).encode("utf-8"))

        versions: dict[str, set[int]] = defaultdict(set)
        for record in records:
            versions[record.template.key].add(record.template.version)
        manifest = {
            "generated_at": now.isoformat(),
            "record_count": len(records),
            "templates": {key: sorted(found) for key, found in versions.items()},
            "files": hashes,
            "missing_files": missing,
            "note": CSV_NOTE,
        }
        archive.writestr(f"{root}/manifest.json", json.dumps(manifest, indent=2))
    return len(records)
