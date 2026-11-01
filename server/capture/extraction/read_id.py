"""Reads the patient ID (RC + digits) off a photographed page, so doctors don't type it."""

import re

from capture.config import Settings
from capture.extraction.ocr import OcrEngine, OcrLine
from capture.extraction.shared_ocr import OcrUnavailable, SharedOcr

__all__ = ["IdReader", "OcrUnavailable", "find_reg_no"]

# "RC12345", "RC 12345", "RC-12345", "Reg No: rc:12345"; the digits must stand alone ("RC123abc" is not an ID).
REG_NO = re.compile(r"\bR\s?C\s*[-:.]?\s*([0-9]{1,30})(?![0-9A-Za-z])", re.IGNORECASE)


def find_reg_no(lines: list[OcrLine]) -> str | None:
    """The first RC number on the page, normalized like capture.api.schemas.normalize_reg_no."""
    for line in lines:
        match = REG_NO.search(line.text)
        if match:
            return "RC" + match.group(1)
    return None


class IdReader:
    def __init__(self, settings: Settings, engine: OcrEngine | None = None) -> None:
        self.ocr = SharedOcr(settings, engine)

    def read(self, image: bytes) -> str | None:
        return find_reg_no(self.ocr.read(1, image))
