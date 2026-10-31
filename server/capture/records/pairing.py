"""Which scans a patient has, and whether they make a pair for Phase 1 (proposal §4.2): a CT/MRI and a later chest X-ray."""

from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

BASELINE, XRAY = "baseline", "xray"
FILMS = {"ct_mri_film_photo": BASELINE, "xray_film_photo": XRAY}
REPORT_MODALITIES = {"CT": BASELINE, "MRI": BASELINE, "X-ray": XRAY}
DICOM_MODALITIES = {"CT": BASELINE, "MR": BASELINE, "CR": XRAY, "DX": XRAY, "RG": XRAY}


@dataclass(frozen=True)
class StudyRow:
    template_key: str
    values: dict[str, Any]
    document_date: date | None


@dataclass(frozen=True)
class Study:
    date: date
    image: bool
    report: bool
    days_after_baseline: int | None = None


@dataclass(frozen=True)
class Pairing:
    baseline: Study | None
    xrays: list[Study]
    paired: bool


def _side(row: StudyRow) -> tuple[str, bool] | None:
    """Which side of a pair the record belongs to, and whether it holds an image (a report holds only words)."""
    if row.template_key in FILMS:
        return FILMS[row.template_key], True
    modality = row.values.get("modality")
    if row.template_key == "radiology_report" and modality in REPORT_MODALITIES:
        return REPORT_MODALITIES[modality], False
    if row.template_key == "dicom_series" and modality in DICOM_MODALITIES:
        return DICOM_MODALITIES[modality], True
    return None


def pairing_of(rows: Iterable[StudyRow]) -> Pairing:
    """One study per side and date. The baseline is the earliest CT/MRI with an image, or else the earliest CT/MRI."""
    studies: dict[tuple[str, date], Study] = {}
    for row in rows:
        side = _side(row)
        if side is None or row.document_date is None:
            continue
        kind, image = side
        seen = studies.get((kind, row.document_date), Study(row.document_date, False, False))
        studies[kind, row.document_date] = replace(seen, image=seen.image or image, report=seen.report or not image)

    scans = sorted((s for (kind, _), s in studies.items() if kind == BASELINE), key=lambda s: s.date)
    xrays = sorted((s for (kind, _), s in studies.items() if kind == XRAY), key=lambda s: s.date)
    if not scans:
        return Pairing(None, xrays, False)
    start = next((s for s in scans if s.image), scans[0])
    follow_ups = [replace(x, days_after_baseline=(x.date - start.date).days) for x in xrays if x.date >= start.date]
    return Pairing(replace(start, days_after_baseline=0), follow_ups, start.image and any(x.image for x in follow_ups))
