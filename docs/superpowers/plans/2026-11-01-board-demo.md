# Board Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the user chose inline execution; no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board of doctors sees a polished app: a doctor records a new lung cancer patient, photographs a report and watches the form fill by itself from OCR, approves it, and sees the patient's history and CT/X-ray pair in one place.

**Architecture:** A new `form` kind of template is typed straight into the app with no photo. The form renderer gains sections, conditional fields and one-tap yes/no answers. OCR plus plain rules replaces the stub in the existing worker, so no GPU or LLM is involved. Pairing is one pure function used by the Patients screen and the export.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL (pgserver), PaddleOCR on CPU, React 19, TanStack Query, Tailwind 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-data-capture-design.md` (§8.3 screens, §10 export) as changed by `2026-10-05-two-panels-design.md`, and by the user's direction below where they disagree.

**Plan style:** short by the user's request ("keep it simple").

## The user's direction (2026-11-01)

- "A board of doctors I will show it to them."
- "We need to polish the app also do good front end then start with ocr."
- "Dicom later we may integrate it with the hospital IT so we get all the data in browser." DICOM upload is out of this plan.
- "Pretend you're a doctor a new patient just came for lung cancer what variable you'll take from the patient will go to app also. So built it."
- "Start fresh, don't depend on what's as run earlier": no earlier result, database, build or APK is trusted.
- The LLM download is paused. Do not resume it. No GPU in this plan.

## Calls made without asking

1. **The new-patient form is `phase: 1`,** so it can be shown now. The MoU and proposal hold clinical data for Phase 3. Say so once; changing it to `phase: 3` locks it.
2. **Reading:** PaddleOCR plus plain rules. A rule that finds nothing leaves the field blank for the doctor. Handwriting is typed by the doctor.
3. **Wording:** without an LLM the app does not say "AI". The button reads "Fill it from the photo".
4. **Pairing:** baseline = the earliest approved CT/MRI with an image, or else the earliest. Follow-up = an approved X-ray on or after it. Paired only when both sides have an image.
5. **Export:** admin only, approved records only.
6. **Deployment:** none for now. The demo runs from this PC through `run-public.ps1`.

## Global Constraints

- **Commit trailer:** every commit ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Execution:** inline, no subagents. After each task: commit, update the ledger and `.superpowers/HANDOFF.md`. Never merge or push without being asked.
- **Commands:** server `cd server && uv run --frozen pytest -q`; web `cd web && npm test && npm run typecheck`; e2e `npm run e2e`. No system `python`.
- **No patient name, phone, address, national ID or date of birth in any form** (MoU).
- **Keep the teal look** the user chose. `ui/styles.ts` holds the shared classes. Delete uses an on-screen confirm, because the Android WebView may not show browser dialogs.
- **The dev database is not to be wiped.** Try-outs use `CAPTURE_DEV_DATA`; e2e uses `server/.devdata-e2e`.
- **Logs and job errors never hold page text or field values.**

## Review Focus

1. **A long form on a phone:** nothing typed is lost when a section closes or the doctor navigates away. Pinned in Task 2.
2. **A patient ID typed wrongly on a new-patient form:** a second first-visit form for the same ID is refused with a way to open the existing patient. Pinned in Task 1.
3. **A hidden conditional field that already holds a value** stays visible, so nothing is silently kept or dropped. Pinned in Task 2.
4. **OCR text with no match, or text the rules misread:** the field stays blank or is flagged for the doctor; the record never gets stuck. Pinned in Task 4.
5. **Export with nothing approved, or a stored file missing:** a valid ZIP, not a 500. Pinned in Task 0b, already done.

---

### Task 0: Fresh baseline (done)
A clean clone of ef37d97 installed from the lockfiles passed every suite.

### Task 0b: Server pairing and export (done)
`capture/records/pairing.py`, `capture/records/export.py`, `capture/api/routes_dataset.py`.

### Task 1: New-patient form on the server

**Files:**
- Create: `templates/new_patient_lung.yaml`, `server/tests/test_new_patient.py`
- Modify: `server/capture/formschema/model.py` (`kind: form`, `section`, `show_if`), `server/capture/records/service.py`, `server/capture/api/routes_records.py`, `server/capture/api/routes_dataset.py`, `server/capture/api/schemas.py`, `server/tests/test_devserver.py`, `server/tests/test_formschema.py`

**Interfaces:**
- Produces: `POST /api/records` accepts no pages for a `form` template and opens a draft with the visit date set to today. A second first-visit form for one patient gets 409.
- Produces: `PatientSummary.profile: dict | None` with `age_years`, `sex`, `smoking_status`, `pack_years`, `ecog`, `histology`, `stage_group`.

- [ ] Failing tests, then build: no photo needed; today's date filled in; a photo refused; a duplicate refused unless the first was deleted; a replay returns the same record; required fields block approval; no job is queued when the worker is on; the export gets flat columns; the form holds no identifier field; `show_if` naming an unknown field is refused; `profile` appears on the patient. Run the server suite. Commit.

### Task 2: New-patient and Patients screens

**Files:**
- Create: `web/src/patients/NewPatientPage.tsx`, `web/src/patients/PatientsPage.tsx`, `web/src/patients/PatientPage.tsx`, and tests beside them
- Modify: `web/src/App.tsx`, `web/src/layout/Layout.tsx`, `web/src/api/hooks.ts`, `web/src/api/types.ts`, `web/src/home/HomePage.tsx`, `web/src/records/FormRenderer.tsx`, `web/src/records/RecordPage.tsx`, `web/src/capture/TemplateStep.tsx`, `web/e2e/flow.spec.ts`

- [ ] Failing tests, then build: sections with a filled count; yes/no answers in one tap, a second tap clears; conditional fields appear when their condition holds and stay when they already hold a value; closing a section keeps what was typed; leaving with unsaved edits asks first; the Patients tiles and search; the patient page with profile and history; the admin's download link; the record page has no photo column for a form. Extend e2e. Commit.

### Task 3: Polish every screen

**Files:** `web/src/**` screens and `web/src/ui/styles.ts`.

- [ ] Screenshot every screen on a phone and on a PC. Fix in the order: broken or misleading, missing states, hierarchy and layout, visual consistency, cleanup.
- [ ] Required fields do not shout before the doctor has tried to send; a summary says what is missing and jumps to it.
- [ ] Read-only records read like a chart, not a page of greyed-out boxes.
- [ ] A sent-back record stays in "Sent back to me" after an edit (test first).
- [ ] Remove dead code: `useNow.ts`, `useHtmlImage.ts`, `phi_cases.json`, the `hit` tone, the quarantine labels. Commit.

### Task 4: OCR plus rules

**Files:**
- Create: `server/capture/extraction/rules.py`, `server/tests/test_rules_reader.py`
- Modify: `server/capture/worker/process.py`, `server/capture/devserver.py`, `server/capture/evaluation.py`, `server/capture/cli.py`, `run-public.ps1`, web wording

- [ ] Failing tests from real OCR lines of the test sheet and golden cases, then build the rules. Score with `capture eval` on the 20 test documents and report the number.
- [ ] Each page is read once, not twice, and OCR is loaded before the first doctor waits. Commit.

### Task 5: Demo kit

**Files:** `server/capture/devserver.py`, `run-public.ps1`, `docs/demo.md`.

- [ ] Made-up sample patients on request (`--seed-demo`), with some paired and some not.
- [ ] Walk the whole story in a browser on a new data folder, with a new build and a new APK. Write the demo script with the board's likely questions.
- [ ] Run every suite. Self-review the branch.
