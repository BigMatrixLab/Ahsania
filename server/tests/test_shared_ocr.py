import threading

import pytest

from capture.extraction.ocr import OcrLine
from capture.extraction.read_id import IdReader
from capture.extraction.shared_ocr import OcrUnavailable, SharedOcr
from constants import JPEG


class CountingOcr:
    def __init__(self) -> None:
        self.images: list[bytes] = []
        self.threads: set[int] = set()

    def read(self, page: int, image: bytes) -> list[OcrLine]:
        self.images.append(image)
        self.threads.add(threading.get_ident())
        return [OcrLine(page, f"text of {len(image)}", (0, 0, 1, 1), 0.9)]


def test_a_page_read_for_the_patient_id_is_not_read_again_for_the_form(settings):
    engine = CountingOcr()
    ocr = SharedOcr(settings, engine=engine)
    first = ocr.read(1, b"page")
    second = ocr.read(1, b"page")
    assert engine.images == [b"page"]
    assert first == second


def test_a_remembered_page_keeps_the_page_number_it_is_asked_for(settings):
    ocr = SharedOcr(settings, engine=CountingOcr())
    ocr.read(1, b"page")
    assert ocr.read(3, b"page")[0].page == 3


def test_different_pages_are_each_read(settings):
    engine = CountingOcr()
    ocr = SharedOcr(settings, engine=engine)
    ocr.read(1, b"one")
    ocr.read(2, b"two!")
    assert engine.images == [b"one", b"two!"]


def test_it_forgets_old_pages_so_memory_stays_small(settings):
    engine = CountingOcr()
    ocr = SharedOcr(settings, engine=engine, remember=2)
    for image in (b"a", b"bb", b"ccc", b"a"):
        ocr.read(1, image)
    assert engine.images == [b"a", b"bb", b"ccc", b"a"]


def test_every_read_runs_on_one_thread_because_the_engine_is_not_thread_safe(settings):
    engine = CountingOcr()
    ocr = SharedOcr(settings, engine=engine)
    callers = [threading.Thread(target=ocr.read, args=(1, bytes([i]))) for i in range(5)]
    for caller in callers:
        caller.start()
    for caller in callers:
        caller.join()
    assert len(engine.images) == 5
    assert len(engine.threads) == 1


def test_warming_up_loads_the_engine_before_the_first_doctor_waits(settings):
    engine = CountingOcr()
    SharedOcr(settings, engine=engine).warm().result()
    assert len(engine.images) == 1


def test_warming_up_without_the_ocr_extra_does_no_harm(settings):
    class NoOcr:
        def read(self, page, image):
            raise ImportError

    assert SharedOcr(settings, engine=NoOcr()).warm().result() is None


def test_a_missing_ocr_extra_is_reported(settings):
    class NoOcr:
        def read(self, page, image):
            raise ImportError

    with pytest.raises(OcrUnavailable):
        SharedOcr(settings, engine=NoOcr()).read(1, JPEG)


def test_the_id_reader_and_the_worker_can_share_one_engine(settings):
    engine = CountingOcr()
    reader = IdReader(settings, engine=engine)
    reader.read(JPEG)
    reader.ocr.read(1, JPEG)
    assert engine.images == [JPEG]
