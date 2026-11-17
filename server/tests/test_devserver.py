import os
import subprocess
import sys

import pytest
from sqlalchemy import func, select

from capture import devserver
from capture.db.base import make_sessionmaker
from capture.db.models import Template, User


def test_prepare_creates_database_templates_and_demo_users(tmp_path, monkeypatch):
    monkeypatch.setattr(devserver, "DATA_DIR", tmp_path / "devdata")
    settings = devserver.prepare(reset=True)
    sessions = make_sessionmaker(settings.database_url)
    with sessions() as s:
        usernames = set(s.scalars(select(User.username)))
        assert {u[0] for u in devserver.DEMO_USERS} <= usernames
        assert s.scalar(select(func.count()).select_from(Template)) == 13
    sessions.kw["bind"].dispose()
    assert settings.cookie_secure is False
    devserver.prepare(reset=True)  # a second reset must also work


def test_the_data_folder_can_be_moved_so_tests_never_touch_the_dev_database(tmp_path):
    env = {**os.environ, "CAPTURE_DEV_DATA": str(tmp_path / "elsewhere")}
    code = "from capture import devserver; print(devserver.DATA_DIR)"
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True, env=env)
    assert result.stdout.strip() == str(tmp_path / "elsewhere")


def test_the_worker_needs_the_ocr_extra(monkeypatch, settings):
    monkeypatch.setattr(devserver.importlib.util, "find_spec", lambda name: None)
    with pytest.raises(SystemExit, match="OCR extra"):
        devserver.start_worker(settings, "rules", None)


def test_the_api_process_loads_neither_the_ocr_engine_nor_the_worker_at_startup():
    # The patient-ID reader (capture.extraction.read_id) loads PaddleOCR on its first read, not on import.
    code = (
        "import sys, capture.api.app; "
        "print(sorted(m for m in sys.modules if m.startswith(('paddle', 'capture.worker', 'capture.extraction.paddle', "
        "'capture.extraction.vlm'))))"
    )
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "[]"
