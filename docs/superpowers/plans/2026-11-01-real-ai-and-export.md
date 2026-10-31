# Real AI, Export and DICOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the user chose inline execution; no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app can be shown working end to end: a real model reads the page, the doctor checks it, the admin approves it, NSU downloads the dataset, the team sees which patients have a paired CT/MRI and X-ray, and DICOM files can go in.

**Architecture:** The worker keeps its OpenAI-compatible client and points at a local model. Pairing is one pure function used by both the Patients page and the export. Export is one function that writes a ZIP. DICOM files are stripped of identifiers on the server as they arrive and become ordinary records.

**Tech Stack:** Ollama (qwen3-vl), FastAPI, SQLAlchemy, PostgreSQL (pgserver), pydicom, React 19, TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-data-capture-design.md` (§4.4 DICOM, §8.3 screens, §10 export) as changed by `2026-10-05-two-panels-design.md`. The calls below change them where they disagree.

**Plan style:** short by the user's request ("keep it simple"). Full code only where a detail is easy to get wrong.

## Calls made without asking (the user said "start working")

1. **Model:** runs on this PC through Ollama for now, because NSU's GPU is not available here. It is still self-hosted. The same client talks to vLLM later; only `CAPTURE_VLM_URL` and `CAPTURE_VLM_MODEL` change.
2. **Which model:** whichever of `qwen3-vl:4b-instruct` and `qwen3-vl:8b-instruct` scores best on `capture eval`, with speed as the tie-break.
3. **Export:** admin only, approved records only. Built with the standard library's `zipfile` into a temp file under the storage folder, then sent. No new dependency.
4. **Pairing:** baseline = the patient's earliest approved CT/MRI. Follow-up = an approved X-ray dated on or after it. A patient is **paired** only when both sides have an image (film photo or DICOM). A report alone shows as "report only", because the proposal needs paired images.
5. **DICOM identifiers** are stripped on the server when each file arrives, following "we strip it when we store it", not in the browser with dcmjs as the old spec said. Text burned into the pixels is not touched.
6. **Deployment:** no Docker or Caddy files for now. Docker is not installed here, so they could not be tested, and they need NSU's hostname. The demo keeps using `run-public.ps1`.
7. **"Start fresh, don't depend on what was run earlier" (user, 2026-11-01):** the existing code stays, but no earlier result, database, build or APK is trusted. Task 0 proves the baseline from a clean clone and lockfiles, and the demo runs on a reset database with a new build and a new APK.

## Global Constraints

- **Commit trailer:** every commit ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Execution:** inline, no subagents. After each task: commit, update the ledger and `.superpowers/HANDOFF.md`. Never merge or push without being asked.
- **Commands:** server `cd server && uv run pytest -q`; web `cd web && npm test && npm run typecheck`; e2e `npm run e2e`. No system `python`.
- **Doctors see every record; admins see every record.** Only export and accounts are admin-only.
- **Style:** match the surrounding code, sparse comments, no new layers. New screens use `ui/styles.ts`.
- **Logs and job errors never hold page text or field values** (M3 rule).

## Review Focus

1. **The real model answers badly** (wrong types, cut off, not JSON, no logprobs): the record still reaches the doctor, as red or amber fields or as manual entry, and never gets stuck. Pinned in Task 1.
2. **Export with nothing approved, or with a stored file missing from disk:** a valid ZIP, not a 500; missing files are named in the manifest. Pinned in Task 2.
3. **A text value starting with `=`, `+`, `-` or `@`** cannot run as a formula when the CSV is opened in Excel. Pinned in Task 2.
4. **A DICOM folder with other files in it, or with two patients in it:** other files are skipped and counted; a second patient stops the upload rather than linking scans to the wrong person. Pinned in Task 4.
5. **The same DICOM file sent twice** (a retry after a dropped connection) is stored once. Pinned in Task 4.

---

### Task 0: Fresh baseline

**Files:** none in the repo. Logs go to the plan workspace.

- [ ] **Step 1:** Clone the branch point (ef37d97) into `.superpowers/fresh`, a folder with no `.venv`, `node_modules`, `dist` or `.devdata`.
- [ ] **Step 2:** In the clone, install from the lockfiles with `uv sync --extra ocr --frozen` and `npm ci`, then run the server tests, the real-OCR test, vitest, tsc, the build, e2e, and `flutter pub get`, `flutter test`, `flutter analyze`.
- [ ] **Step 3:** Read each result. Anything red is fixed, test first, before new work relies on it.

### Task 1: The real model replaces the stub

**Files:**
- Modify: `run-public.ps1`, `server/README.md`, `eval/README.md`
- Modify only if the real answers need it: `server/capture/extraction/vlm.py`, `server/capture/extraction/schema.py`
- Test: `server/tests/test_vlm.py`

- [ ] **Step 1:** Install Ollama and pull `qwen3-vl:4b-instruct` and `qwen3-vl:8b-instruct`.
- [ ] **Step 2:** Send one golden page through `VlmClient` and read the raw answer. Check: JSON that fits the schema, `logprobs.content` present, tokens joining back to the text.
- [ ] **Step 3:** Run `CAPTURE_VLM_URL=http://127.0.0.1:11434/v1 CAPTURE_VLM_MODEL=<model> uv run capture eval` for both models and time them. Record accuracy and seconds per page in the ledger.
- [ ] **Step 4:** Fix whatever Steps 2-3 show, test first. A client change gets a unit test in `test_vlm.py` built from the real answer's shape.
- [ ] **Step 5:** Run `run-public.ps1`'s API with `--worker vlm` on page 1 of `eval/test-sheet.pdf` and check the form against the sheet (CT, 14/08/2026, contrast yes, RUL 3.2×2.4, LLL 1.1×0.9, left effusion, increased).
- [ ] **Step 6:** `run-public.ps1` runs `--worker vlm` with the chosen model by default, `-Stub` keeps the old behaviour, and it warns when Ollama is not answering. Update both READMEs. Commit.

### Task 2: Pairing and export on the server

**Files:**
- Create: `server/capture/records/pairing.py`, `server/capture/records/export.py`, `server/capture/api/routes_patients.py`
- Modify: `server/capture/api/app.py`, `server/capture/api/schemas.py`
- Test: `server/tests/test_pairing.py`, `server/tests/test_export.py`, `server/tests/test_patients.py`

**Interfaces:**
- Produces: `pairing_of(rows: Iterable[StudyRow]) -> Pairing`, where `StudyRow(template_key: str, values: dict, document_date: date | None)`, `Pairing(baseline: Study | None, xrays: list[Study], paired: bool)` and `Study(date: date, image: bool, report: bool, days_after_baseline: int | None)`.
- Produces: `write_export(db, settings, out: BinaryIO, now: datetime) -> int` (records written).
- Produces: `GET /api/patients` (any user) → `[{reg_no, record_count, approved_count, baseline, xrays, paired}]`; `GET /api/patients/{reg_no}` → the same plus `records: RecordSummary[]`, earliest document first, 404 when none; `GET /api/export` (admin) → `application/zip`.

- [ ] **Step 1: Failing pairing tests** (`test_pairing.py`): CT film + later X-ray film → paired with `days_after_baseline`; radiology report `modality` CT/MRI/X-ray counts as that kind; PET-CT counts as neither; report-only side → not paired, `image` False; report + film on one date → one study with both flags; X-ray before the baseline → not a follow-up; same-day X-ray → paired with 0 days; earliest CT/MRI is the baseline; `document_date` None is ignored; DICOM modality CT/MR is baseline and CR/DX/RG is X-ray.
- [ ] **Step 2:** Implement `pairing.py`. Run; PASS.
- [ ] **Step 3: Failing export tests** (`test_export.py`, on real uploads taken to `approved`): only approved records appear; `radiology_report.csv` has one row with the template's scalar columns; `radiology_report__lesions.csv` has one row per lesion keyed by `record_id`; `records.json` holds nested values; `pairing_report.csv` matches `pairing_of`; every path in the manifest exists in the ZIP with a matching SHA-256; a doctor gets 403; nothing approved → a valid ZIP with `record_count` 0; a page deleted from disk → listed under `missing_files`; `=SUM(A1)` and `+ve` come out with a leading `'` in the CSV but raw in `records.json`; the temp file is gone after the response.
- [ ] **Step 4:** Implement `export.py` and the route. Layout: `export-<timestamp>/{manifest.json, <template>.csv, <template>__<group>.csv, records.json, pairing_report.csv, files/<reg_no>/<record_id>/...}`. JPEGs `ZIP_STORED`, the rest `ZIP_DEFLATED`. Run; PASS.
- [ ] **Step 5: Failing patient route tests** (`test_patients.py`): list and detail for both roles; a deleted record never counts; pairing uses approved records only while `records` lists every status; `rc 123` finds `RC123`; unknown ID → 404. Implement. Run the whole server suite. Commit.

### Task 3: Patients page, download button, small fixes

**Files:**
- Create: `web/src/patients/PatientsPage.tsx`, `web/src/patients/PatientPage.tsx`, `web/src/patients/PatientsPage.test.tsx`
- Modify: `web/src/App.tsx`, `web/src/layout/Layout.tsx`, `web/src/api/hooks.ts`, `web/src/api/types.ts`, `web/src/home/HomePage.tsx`, `web/src/records/RecordList.tsx`, `web/src/records/RecordPage.tsx`, `web/src/records/PageViewer.tsx`, `web/e2e/flow.spec.ts`, `web/playwright.config.ts`, `server/capture/devserver.py`, `.gitignore`
- Delete: `web/src/ui/useNow.ts`, `web/src/imaging/useHtmlImage.ts`, `web/src/imaging/useHtmlImage.test.ts`, `server/tests/fixtures/phi_cases.json`

- [ ] **Step 1: Failing tests** (`PatientsPage.test.tsx`): tiles show patients, paired and approved counts; a search for `rc 12` narrows the list; a report-only side reads "report only"; the download link shows for an admin and not for a doctor; the empty state shows.
- [ ] **Step 2:** Build `/patients` and `/patients/:regNo`, add "Patients" to the nav. Download is a plain `<a href="/api/export" download>`.
- [ ] **Step 3: Failing test, then fix:** a sent-back record stays in "Sent back to me" after the doctor saves an edit. `HomePage` and `RecordList` use `status === "draft" && sent_to_admin` instead of the last event.
- [ ] **Step 4:** Remove the dead files and the leftover `hit` tone and quarantine labels. `tsc` must stay clean.
- [ ] **Step 5:** `DATA_DIR` honours `CAPTURE_DEV_DATA`; Playwright sets it to `server/.devdata-e2e` so e2e no longer wipes the dev database. Git-ignore the folder.
- [ ] **Step 6:** Extend the e2e story: after both records are approved, Patients shows RC555 and a ZIP downloads as the admin with a manifest in it. Run e2e. Commit.

### Task 4: DICOM upload

**Files:**
- Create: `server/capture/dicom.py`, `server/capture/api/routes_dicom.py`, `web/src/capture/DicomStep.tsx`, `web/src/capture/DicomStep.test.tsx`, `web/e2e/fixtures/make_dicom.py`, `web/e2e/fixtures/dicom/`
- Modify: `server/pyproject.toml` (`pydicom`, `numpy`, JPEG decoders), `server/capture/config.py` (`max_dicom_bytes = 100 MB`), `server/capture/api/app.py`, `web/src/capture/CapturePage.tsx`, `web/src/capture/TemplateStep.tsx`, `web/e2e/flow.spec.ts`
- Test: `server/tests/test_dicom.py`

**Interfaces:**
- Produces: `scrub(data: bytes, reg_no: str) -> ScrubbedFile(data, series_uid, sop_uid, patient_key)`, raising `NotDicom`; `read_fields(paths: list[Path]) -> dict` (template values); `preview_jpeg(path: Path) -> bytes | None`.
- Produces: `POST /api/dicom/peek` (one file → `{reg_no: str | None, patient_key: str}`); `POST /api/dicom/files` (`meta {reg_no, batch_id, patient_key}` + one file → `{record_id, stored}`; 415 not DICOM, 422 another patient); `POST /api/records/{id}/finalize` (doctor; reads headers into the fields, adds a preview page, idempotent).

- [ ] **Step 1: Failing tests** (`test_dicom.py`, with pydicom-built files, no real data): after `scrub`, PatientName and PatientID are the reg. no.; birth date, institution, physician names, accession number, private tags and every nested person-name element are gone; age, sex, dates and geometry (`PixelSpacing`, `SliceThickness`, `ImagePositionPatient`, `Rows`, `Columns`) are unchanged; Study/Series/SOP UIDs are `2.25.*`, the same on every call, and the file-meta UID matches. A text file and a DICOMDIR raise `NotDicom`.
- [ ] **Step 2:** Implement `dicom.py`. Run; PASS.
- [ ] **Step 3: Failing route tests:** three slices of one series make one record with three files; a second series in the batch makes a second record; the same file twice is stored once; a text file → 415 and nothing stored; another patient's file → 422; a doctor can upload and an admin cannot; finalize fills modality, date, spacing and `image_count`, adds a preview `page`, and is idempotent; a series with no study date stays a draft that cannot be approved; a preview that cannot be decoded still finalizes; delete removes the files; the export includes the `.dcm` files; the raw patient name appears nowhere in stored bytes.
- [ ] **Step 4:** Implement the routes. Run the server suite.
- [ ] **Step 5: Failing web tests, then build:** choosing "DICOM series" leads to a files step (folder or files), the patient ID is pre-filled from peek when it is RC + digits, progress shows "N of M", other files are skipped and counted, a second patient stops the upload with a clear message, a dropped connection retries each file up to 3 times, then each series is finalized and the doctor lands on the patient page.
- [ ] **Step 6:** Add a three-slice synthetic fixture and an e2e step. Run e2e. Commit.

### Task 5: Ready to show

**Files:**
- Modify: `server/capture/devserver.py`, `run-public.ps1`, `server/tests/test_devserver.py`
- Create: `docs/demo.md`

- [ ] **Step 1: Failing test:** `seed_demo` on an empty database creates approved synthetic records from `eval/golden` for a handful of patients, with some paired, one missing its X-ray and one report-only, with values taken from each case's `expected.json`, and does nothing on a second run.
- [ ] **Step 2:** Implement it behind `--seed-demo`; `run-public.ps1 -Demo` passes it.
- [ ] **Step 3:** The public run uses a Secure cookie (`CAPTURE_COOKIE_SECURE=true`, honoured by `prepare()`); e2e and plain dev stay on `false`.
- [ ] **Step 4:** Run the app through a browser with the real model: capture the test sheet, approve as doctor and admin, see the Patients page, download the ZIP and check the manifest. Fix what breaks.
- [ ] **Step 5:** Write `docs/demo.md`: what to start, what to click, what to say about what is real and what is not. Run every suite. Commit. Self-review the whole branch.
