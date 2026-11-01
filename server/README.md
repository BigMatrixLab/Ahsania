# Capture server

FastAPI + PostgreSQL API for the AMCGH × NSU lung cancer data capture app.
Design: `../docs/superpowers/specs/2026-10-04-data-capture-design.md`, changed by `2026-10-05-two-panels-design.md`
(two roles, doctor and admin).

## Develop

```bash
uv sync                                        # Python 3.12 + dependencies
uv run pytest                                  # tests (start their own PostgreSQL)
uv run python -m capture.devserver --reset     # API on http://127.0.0.1:8000, demo users
```

Demo logins (password `demo-pass-123`): `doctor`, `doctor2`, `admin`.

## Operate

Configuration comes from `CAPTURE_*` environment variables (see `capture/config.py`):
`CAPTURE_DATABASE_URL`, `CAPTURE_STORAGE_DIR`, `CAPTURE_COOKIE_SECURE` (keep `true` behind HTTPS),
`CAPTURE_EXTRACTION_ENABLED` (`true` once a worker runs, see below).

```bash
uv run alembic upgrade head                    # migrate
uv run capture templates load                  # add new templates / versions from ../templates
uv run capture users create ID "Full Name" admin       # the first admin; admins add the rest under Accounts
uv run capture users deactivate ID
uv run capture eval                            # a model's accuracy on ../eval/golden (needs CAPTURE_VLM_URL)
uv run uvicorn capture.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

## Reading the photos

The worker reads each upload with PaddleOCR on the CPU, then fills the form with plain rules (`capture/extraction/rules.py`). No GPU or model is needed. A rule that finds nothing leaves the field blank for the doctor. Uploads made with "I'll fill it myself" skip it.

```bash
uv sync --extra ocr                                                  # PaddleOCR + PaddlePaddle; models download on first use
uv run --extra ocr python -m capture.devserver --worker rules        # API + worker in one process; a page is read once
uv run --extra ocr python -m capture.devserver --worker rules --seed-demo   # plus made-up sample patients on an empty database
uv run --extra ocr capture eval --rules                              # score OCR + rules on ../eval/golden
uv run --extra ocr pytest -m paddle                                  # the real-OCR test (left out of plain `uv run pytest`)
uv run --extra ocr python -m capture.worker                          # a separate worker (API needs CAPTURE_EXTRACTION_ENABLED=true)
```

`CAPTURE_DEV_DATA` moves the dev server's data folder, so try-outs never touch `.devdata`. `--reset` wipes the chosen folder.

A plain `uv sync` removes the OCR extra again; `uv run` leaves it installed.

To use a model instead of rules later: `--worker vlm` (or `CAPTURE_READER=vlm` for `capture.worker`), with the model at `CAPTURE_VLM_URL` and its name in `CAPTURE_VLM_MODEL`. Fields below `CAPTURE_CONFIDENCE_THRESHOLD` (default 0.85) are shown amber. Keep `CAPTURE_OCR_ENABLE_MKLDNN=false` on Windows.
