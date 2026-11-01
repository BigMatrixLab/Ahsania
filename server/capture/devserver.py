"""Run the API locally on an embedded PostgreSQL with demo users (development and e2e tests only)."""

import argparse
import importlib.util
import logging
import os
import shutil
import threading
from pathlib import Path

import pgserver
import uvicorn
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url

from capture.api.app import create_app
from capture.auth.passwords import hash_password
from capture.config import Settings
from capture.db.base import make_sessionmaker
from capture.db.migrate import upgrade
from capture.db.models import User
from capture.demo import seed_demo
from capture.extraction.ocr import OcrEngine
from capture.formschema.store import load_templates

SERVER_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("CAPTURE_DEV_DATA") or SERVER_DIR / ".devdata")  # e2e and try-outs keep their own folder
TEMPLATES_DIR = SERVER_DIR.parent / "templates"
DEMO_PASSWORD = os.environ.get("CAPTURE_DEMO_PASSWORD", "demo-pass-123")  # set your own before exposing the server
DEMO_USERS = [
    ("doctor", "Demo Doctor", "doctor"),
    ("doctor2", "Demo Doctor Two", "doctor"),
    ("admin", "Demo Admin", "admin"),
]


def prepare(reset: bool) -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(DATA_DIR / "pg", cleanup_mode="stop")
    admin_url = make_url(server.get_uri()).set(drivername="postgresql+psycopg")
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        if reset:
            conn.execute(text("DROP DATABASE IF EXISTS capture WITH (FORCE)"))
        if not conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = 'capture'")):
            conn.execute(text("CREATE DATABASE capture"))
    engine.dispose()

    storage = DATA_DIR / "storage"
    if reset and storage.exists():
        shutil.rmtree(storage)
    url = admin_url.set(database="capture").render_as_string(hide_password=False)
    upgrade(url)
    sessions = make_sessionmaker(url)
    with sessions.begin() as s:
        load_templates(s, TEMPLATES_DIR)
        for username, name, role in DEMO_USERS:
            if s.scalar(select(User).where(User.username == username)) is None:
                s.add(User(name=name, username=username, password_hash=hash_password(DEMO_PASSWORD), role=role))
    sessions.kw["bind"].dispose()
    secure = os.environ.get("CAPTURE_COOKIE_SECURE", "false").lower() == "true"  # true when served over HTTPS
    return Settings(database_url=url, storage_dir=storage, cookie_secure=secure)


def start_worker(settings: Settings, mode: str, ocr: OcrEngine) -> threading.Event:
    """Run the extraction worker in a background thread with real PaddleOCR, and either plain rules ("rules")
    or the model server at CAPTURE_VLM_URL ("vlm"). Returns the event that stops it."""
    if importlib.util.find_spec("paddleocr") is None:
        raise SystemExit(
            "The worker needs the OCR extra: run the dev server with `uv run --extra ocr python -m capture.devserver ...`"
        )
    from capture.extraction.vlm import client_from_settings
    from capture.worker.loop import run_worker
    from capture.worker.process import Engines

    engines = Engines(ocr=ocr, vlm=client_from_settings(settings) if mode == "vlm" else None)
    stop = threading.Event()
    sessions = make_sessionmaker(settings.database_url)
    threading.Thread(target=run_worker, args=(sessions, settings, engines, stop, "devserver"), name="worker", daemon=True).start()
    return stop


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="wipe the dev database and stored files first")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--worker",
        choices=["off", "rules", "vlm"],
        default="off",
        help="off: uploads go straight to manual entry; rules: PaddleOCR + plain rules, CPU only; "
        "vlm: PaddleOCR + the model server at CAPTURE_VLM_URL",
    )
    parser.add_argument("--seed-demo", action="store_true", help="add made-up sample patients to an empty database")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = prepare(args.reset)
    if args.seed_demo:
        print(f"Sample records added: {seed_demo(make_sessionmaker(settings.database_url), settings)}")
    if args.worker != "off":
        settings = settings.model_copy(update={"extraction_enabled": True})
    app = create_app(settings)
    if args.worker != "off":
        ocr = app.state.id_reader.ocr  # one OCR for the patient ID and the form, so a page is read once
        start_worker(settings, args.worker, ocr)
        ocr.warm()
    print(f"Demo users (password {DEMO_PASSWORD!r}): " + ", ".join(u[0] for u in DEMO_USERS))
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
