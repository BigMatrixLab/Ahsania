"""One OCR engine for the whole process: reading the patient ID and filling the form use the same copy.

Every read runs on one dedicated thread, because PaddleOCR is not thread-safe. Recent pages are remembered, so the
page read for the patient ID is not read again when the form is filled. Nothing is written to disk or logged.
"""

import hashlib
import io
from collections import OrderedDict
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import replace

from capture.config import Settings
from capture.extraction.ocr import OcrEngine, OcrLine


class OcrUnavailable(Exception):
    """The server was installed without the OCR extra."""


def _blank_page() -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(buffer, format="JPEG")
    return buffer.getvalue()


class SharedOcr:
    def __init__(self, settings: Settings, engine: OcrEngine | None = None, remember: int = 64) -> None:
        self._settings = settings
        self._engine = engine  # created on first use when not given
        self._remember = remember
        self._recent: OrderedDict[str, list[OcrLine]] = OrderedDict()
        self._thread = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ocr")

    def _read(self, page: int, image: bytes) -> list[OcrLine]:
        key = hashlib.sha256(image).hexdigest()
        lines = self._recent.get(key)
        if lines is None:
            if self._engine is None:
                from capture.extraction.paddle import PaddleOcrEngine

                self._engine = PaddleOcrEngine(self._settings)
            lines = self._engine.read(page, image)
            self._recent[key] = lines
            if len(self._recent) > self._remember:
                self._recent.popitem(last=False)
        else:
            self._recent.move_to_end(key)
        return [replace(line, page=page) for line in lines]

    def read(self, page: int, image: bytes) -> list[OcrLine]:
        try:
            return self._thread.submit(self._read, page, image).result()
        except ImportError:  # PIL, numpy or paddleocr missing
            raise OcrUnavailable from None

    def warm(self) -> Future:
        """Load the engine in the background, so the first doctor does not wait for it."""

        def load() -> None:
            try:
                self._read(1, _blank_page())
            except ImportError:
                pass

        return self._thread.submit(load)
