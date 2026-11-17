# Import Patient, Two-Way Hospital Sync and Windows App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "New patient" with "Import patient". The doctor picks an RC number from the hospital's list, and the form fills from the hospital system. Two new follow-up forms work the same way. On admin approval, the values the hospital lacked, and the approved corrections, go back to the hospital. A Windows app wraps the same web app.

**Architecture:** Three new YAML templates carry a `hospital: true` flag. A small `capture/hospital/` package hides the hospital behind one interface with two versions: `stub`, a made-up hospital kept in a JSON file, and `http`, the contract we give hospital IT. On creation the server pulls the hospital's values itself and keeps them as a snapshot on the record. On admin approval it diffs the snapshot against the approved values and sends new values and corrections, with the old value as `expect`, so it never overwrites a value changed at the hospital meanwhile. The web form shows a "from hospital" tag and a warning when a hospital value is changed. The Flutter shell in `mobile/` gains a Windows target.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL via pgserver in tests, httpx; React 19, react-router 8, TanStack Query, vitest, Playwright; Flutter 3.47 with flutter_inappwebview 6.2.0-beta.3 (Windows uses WebView2); Inno Setup 6 for the installer.

**Spec:** `docs/superpowers/specs/2026-11-17-import-patient-design.md` (approved 2026-11-17). Read it alongside this plan: the full field tables for the three forms live there and are not repeated here.

## Global Constraints

- No variable for name, address, phone, national ID or date of birth on any new form, in the stub, or in anything sent to the hospital. The RC number is the only identifier.
- RC numbers use the existing rule: `RC` + 1–30 digits, uppercased, spaces removed (`normalize_reg_no`).
- Values go to the hospital only on admin approval, for new values and corrections alike.
- Hospital values are always editable by the doctor.
- Blank values are never sent. If a doctor clears a hospital value, the hospital keeps its value. (My call: a missing answer is not a correction.)
- A key whose hospital value no longer matches the snapshot is never written. It becomes a conflict for the admin.
- Exact copy:
  - home card: "Import patient" / "From the hospital system"
  - tag: "From hospital"
  - change warning: "Hospital has {old}. If you and an admin approve, the hospital's value will be changed to {new}."
  - cleared hospital value: "Hospital has {old}. A blank is not sent; the hospital keeps its value."
  - hospital down: "Hospital system not reachable. Type the RC number and fill the form by hand."
  - unknown RC: "This RC number is not in the hospital system."
  - manual link: "Not in the list? Type the RC number"
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Chain test-then-commit with `&&` so a red test never commits.
- Server tests: `cd server && uv run --frozen pytest -q`. Web: `cd web && npm test && npm run typecheck`.

## Deviations from the spec (write them into the spec in Task 1)

1. **Sync without the job queue.** The spec runs the sync as a job in the existing job queue with retries. That queue only claims `kind == "extract"` jobs and needs the separate worker process, which a plain API run does not start. To keep it simple, this plan sends right after approval in a FastAPI background task. A failure leaves the sync line on *Hospital refused* or *Hospital not reachable*, with **Try again** for the admin. There are no automatic retries.
2. **Own page, not the New capture list.** The spec puts the three hospital forms at the top of the New capture form list. This plan gives them their own **Import patient** page, reached from the home card that today says "New patient". New capture stays the photo flow, unchanged. One entry point per way of working is simpler for doctors and for the code.

## Review Focus

1. **Hospital down while importing.** Opening the dropdown or creating a record from the hospital must say "Hospital system not reachable…" and open manual entry, never a blank page or a 500. Tested in Task 4 (API 503) and Task 6 (page switches to manual).
2. **Hospital sends keys we don't have, identifying keys, or values of the wrong shape.** Unknown keys, including `patient_name`, are dropped and never stored. A value outside a field's options is kept and shows as a red field error, the same as a typing mistake. Tested in Task 4.
3. **Doctor clears a hospital value.** It is not sent, and the warning says the hospital keeps its value. Tested in Task 5 (server) and Task 7 (web).
4. **Try again after a successful send.** Nothing is sent twice, because the snapshot takes the sent values. Tested in Task 5.
5. **The hospital changed a value after we imported it.** That key becomes a conflict, is not overwritten, and the other keys still send. Tested in Task 5.

---

### Task 1: Template flags — `hospital`, `repeats`, `retired`

**Files:**
- Modify: `server/capture/formschema/model.py` (`TemplateDef`)
- Modify: `server/capture/records/service.py` (`create_record`, `_has_form`)
- Modify: `web/src/api/types.ts` (`TemplateDefinition` / definition typing)
- Modify: `docs/superpowers/specs/2026-11-17-import-patient-design.md` (deviation note under "Server changes")
- Test: `server/tests/test_template_flags.py`

**Interfaces:**
- Produces: `TemplateDef.hospital: bool = False`, `TemplateDef.repeats: bool = False`, `TemplateDef.retired: bool = False`. These live in the stored `definition` JSON, so the web reads `template.definition.hospital` etc. `create_record` refuses a retired template with `UploadRejected(410, "This form is no longer used")`. The one-per-patient check (`_has_form`, 409) applies only when `repeats` is false.

- [ ] **Step 1: Write the failing tests** in `server/tests/test_template_flags.py`. Build `TemplateDef` dicts in the tests and load them with `load_templates` into a tmp dir, as `test_store.py` does:
  - `test_flags_default_to_false`: a minimal form template → `hospital is False and repeats is False and retired is False`.
  - `test_a_retired_form_cannot_be_started`: a retired `kind: form` template → POST `/api/records` gives `410` and detail `"This form is no longer used"`.
  - `test_a_repeating_form_allows_many_per_patient`: a `repeats: true` form → two creations for `RC1` both `201`.
  - `test_a_non_repeating_form_is_still_once_per_patient`: second creation → `409`, `"This patient already has this form"`.
- [ ] **Step 2: Run** `uv run --frozen pytest tests/test_template_flags.py -q`. Expected: FAIL (extra fields forbidden / 201 instead of 410).
- [ ] **Step 3: Implement.** Add the three fields to `TemplateDef`. In `create_record`, put the retired check right after the unknown-template check, and wrap `_has_form` in `not tpl.repeats`. Read the flags via `template_def(template)`. Add `hospital?: boolean; repeats?: boolean; retired?: boolean` to the web definition type. Write the deviation paragraph above into the spec.
- [ ] **Step 4: Run** the new tests plus the full server suite. Expected: PASS, no regressions.
- [ ] **Step 5: Commit** `feat(server): template flags for hospital-linked, repeating and retired forms`.

### Task 2: The three forms, retire the old ones

**Files:**
- Create: `templates/import_patient.yaml`, `templates/treatment.yaml`, `templates/toxicity_outcome.yaml`
- Modify: `templates/new_patient_lung.yaml`, `templates/treatment_sheet.yaml`, `templates/outcome_followup.yaml` → `version: 2`, `retired: true`, fields unchanged
- Modify: `server/capture/api/routes_dataset.py` (profile source), `server/capture/demo.py` (`FIRST_VISIT = "import_patient"`)
- Rename + modify: `server/tests/test_new_patient.py` → `server/tests/test_import_patient.py` (`FORM = "import_patient"`)
- Modify: `server/tests/test_store.py`, `server/tests/test_settings_routes.py` (template list and phase-3 set)

**Interfaces:**
- Consumes: Task 1 flags.
- Produces:
  - Template keys `import_patient` (phase 1, kind `form`, `hospital: true`, title "Import patient").
  - `treatment` (phase 1, kind `form`, `hospital: true`, `repeats: true`, title "Treatment").
  - `toxicity_outcome` (phase 1, kind `form`, `hospital: true`, `repeats: true`, title "Toxicity & outcome").
  - Document-date keys: `visit_date`, `treatment_date`, `followup_date`.
  - `FIRST_VISIT_FORMS = ("import_patient", "new_patient_lung")` in `routes_dataset.py`. The profile comes from the first row whose `key` is in it, not from any `kind == "form"`.

- [ ] **Step 1: Write the failing tests** in `test_import_patient.py`. Keep every existing test with `FORM = "import_patient"`, then add:
  - `test_import_patient_has_every_new_field`: the template's top-level keys ⊇ the 40 new keys in the spec's "New fields" table. Write the set out literally in the test, from `pollution_source` to `molecular_method`, with the nine `mol_*` keys spelled out.
  - `test_changed_options`: `residence` options == `["urban", "rural", "semi-urban"]`; `smokeless_tobacco` is enum `["never", "current", "former"]`; `m_stage` options include `M1c1` and `M1c2`; `primary_site` includes `multiple`.
  - `test_met_fields_follow_distant_mets`: every `met_*` field has `show_if == {"key": "distant_mets", "values": [True]}`.
  - `test_required_set`: required keys == `{"visit_date", "age_years", "sex", "smoking_status", "ecog"}`.
  - `test_follow_up_forms_required`: `treatment` requires `{"treatment_date", "treatment_intent"}`; `toxicity_outcome` requires `{"followup_date", "vital_status"}`.
  - `test_no_form_asks_for_an_identifier`: the existing identifier regex check, run over all three new templates, including group children.
  - `test_old_first_visit_form_is_retired`: creating `new_patient_lung` → 410.
  - `test_profile_ignores_treatment_records`: an approved `treatment` record and an approved `import_patient` with `FILLED` for RC1 → `profile["age_years"] == 62`.
- [ ] **Step 2: Run** `uv run --frozen pytest tests/test_import_patient.py -q`. Expected: FAIL (unknown form type).
- [ ] **Step 3: Write the three YAML files** from the spec's tables:
  - `import_patient` = `new_patient_lung` v1 with the "Changed existing fields" applied and the 40 new fields added in their sections. Order: after the related existing field, with each new section's fields at the end of that section. Molecular gets its own section "Molecular and biomarkers" after "Diagnosis and stage".
  - Header comment: "No name, phone, address, national ID or date of birth: the MoU forbids them."
  - Put the BMI and pack-years formulas in `hint`: "Filled from weight and height" and the existing pack-years hint.
  - Retire the three old templates at version 2.
  - Update `routes_dataset.py`, `demo.py` and the template lists in `test_store.py` and `test_settings_routes.py`. `treatment_sheet` and `outcome_followup` stay phase 3 but retired.
- [ ] **Step 4: Run** the full server suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Import patient, Treatment and Toxicity & outcome forms; old forms retired`.

### Task 3: Hospital connector (stub and http) and the API contract for hospital IT

**Files:**
- Create: `server/capture/hospital/__init__.py`, `server/capture/hospital/client.py`, `server/capture/hospital/stub.py`, `server/capture/hospital/http.py`
- Modify: `server/capture/config.py`, `server/capture/api/app.py`, `server/capture/api/deps.py`
- Create: `docs/hospital-api.md` (the contract from the spec's "Hospital API contract", written for hospital IT, with one example request and response per call)
- Test: `server/tests/test_hospital_client.py`

**Interfaces:**
- Produces (in `capture/hospital/client.py`):
  ```python
  class HospitalUnavailable(Exception): ...        # cannot reach it, timeout, 5xx
  class NotAtHospital(Exception): ...              # 404 for this RC
  @dataclass(frozen=True)
  class HospitalPatient: rc: str; updated_at: str | None
  @dataclass(frozen=True)
  class UpdateResult: applied: list[str]; conflicts: list[dict]   # each {"key": str, "hospital_value": Any}
  class Hospital(Protocol):
      def list_patients(self) -> list[HospitalPatient]: ...
      def get_values(self, rc: str, form: str) -> dict[str, Any]: ...
      def update(self, rc: str, form: str, set_values: dict[str, Any], expect: dict[str, Any]) -> UpdateResult: ...
  def make_hospital(settings: Settings) -> Hospital
  ```
- `StubHospital(path: Path)` stores `{"patients": {rc: {"updated_at": str, "forms": {form: {key: value}}}}}`. When the file is missing it is seeded by `seed_patients(rng: random.Random) -> dict` with 30 made-up patients, `RC500001`–`RC500030`.
  - Each has about half of the `import_patient` keys filled with valid values; the rest are absent.
  - About a third also have `treatment` and `toxicity_outcome` values.
  - `RC500030` has an extra `"patient_name": "Test"`, so Review Focus 2 can be seen by hand.
- `StubHospital.update` writes a key only when the current value equals `expect.get(key)`, treating absent as `None`. Otherwise it reports a conflict.
- `HttpHospital(url, token, timeout, transport: httpx.BaseTransport | None = None)` implements `docs/hospital-api.md`.
- Settings: `hospital: str = "stub"`, `hospital_url: str = ""`, `hospital_token: str = ""`, `hospital_timeout_s: float = 10`, `hospital_stub_file: Path | None = None`. `None` means `storage_dir / "hospital-stub.json"`.
- `app.state.hospital = make_hospital(settings)`; `deps.get_hospital(request) -> Hospital`.

- [ ] **Step 1: Write the failing tests:**
  - Stub:
    - `test_stub_seeds_thirty_patients_once`: two `StubHospital(tmp)` on the same file → the same 30 RCs.
    - `test_stub_get_values_unknown_rc_raises`: unknown RC → `NotAtHospital`.
    - `test_stub_update_writes_new_and_matching_keys`: `set={"education": "primary"}`, `expect={}` on a key absent at the hospital → `applied == ["education"]`, and it is persisted on reread.
    - `test_stub_update_conflict_when_value_moved`: the hospital has `age_years=56`; `set={"age_years": 58}`, `expect={"age_years": 50}` → `conflicts == [{"key": "age_years", "hospital_value": 56}]`, value still 56.
  - Http, with `httpx.MockTransport`:
    - `test_http_list_and_get_send_bearer_token`: the handler asserts `Authorization: Bearer t`, paths `/patients` and `/patients/RC1?form=import_patient`.
    - `test_http_404_is_not_at_hospital`.
    - `test_http_connect_error_and_500_are_unavailable`.
    - `test_http_update_parses_applied_and_conflicts`: PATCH body == `{"form": "import_patient", "set": {...}, "expect": {...}}`.
  - Config: `test_make_hospital_picks_by_setting`: `hospital="stub"` → `StubHospital`; `"http"` → `HttpHospital`; anything else → `ValueError`.
- [ ] **Step 2: Run** `uv run --frozen pytest tests/test_hospital_client.py -q`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the package, settings and app wiring. Write `docs/hospital-api.md` in plain English for hospital IT:
  - the three calls, with JSON examples;
  - the value formats;
  - "never send name, address, phone, national ID or date of birth";
  - a link to the data dictionary, which is the three YAML files.
- [ ] **Step 4: Run** the full server suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): hospital connector with a stand-in hospital and the API contract`.

### Task 4: Import from the hospital — list, create, snapshot

**Files:**
- Create: `server/migrations/versions/0005_hospital.py` (records: `hospital_snapshot JSONB NULL`, `hospital_sync JSONB NULL`)
- Modify: `server/capture/db/models.py` (`Record.hospital_snapshot`, `Record.hospital_sync`)
- Create: `server/capture/api/routes_hospital.py`; register in `app.py`'s `ROUTERS`
- Modify: `server/capture/api/schemas.py` (`CreateMeta.from_hospital: bool = False`; `RecordDetail.hospital_snapshot: dict | None = None`, `RecordDetail.hospital_sync: dict | None = None`; `HospitalPatientOut`)
- Modify: `server/capture/api/convert.py` (fill the two detail fields), `server/capture/api/routes_records.py` (`create` passes `hospital`), `server/capture/records/service.py` (`create_record(..., from_hospital: bool, hospital: Hospital)`)
- Test: `server/tests/test_hospital_import.py` (a fixture puts a `StubHospital` on `tmp_path` into `app.state.hospital`)

**Interfaces:**
- Consumes: Task 3 `Hospital`, `HospitalUnavailable`, `NotAtHospital`; Task 1 `hospital` flag.
- Produces:
  - `GET /api/hospital/patients?form=<key>` → `list[HospitalPatientOut]`, where `HospitalPatientOut(rc: str, imported: bool)`. `imported` is true when a non-deleted record of that form exists for the RC. Newest `updated_at` first. Doctor and admin.
  - `POST /api/records` with `from_hospital: true` on a hospital template: the server calls `get_values(rc, form)` and keeps only the template's top-level field keys. The result becomes `hospital_snapshot` and `field_values`; the document date defaults to today when the hospital has none. A `ReviewEvent(action="import")` is recorded.
  - `RecordDetail.hospital_snapshot` and `.hospital_sync`.

- [ ] **Step 1: Write the failing tests:**
  - `test_patient_list_marks_imported`: import `RC500001` → its row has `imported: true`, the others false.
  - `test_import_fills_known_fields_and_snapshot`: the record's `values` ⊆ the stub's values plus the visit date; `hospital_snapshot` == those values minus the defaulted date.
  - `test_import_drops_unknown_and_identifying_keys`: stub `RC500030` → `"patient_name"` is not in `values` and not in `hospital_snapshot` (Review Focus 2).
  - `test_bad_enum_from_hospital_shows_as_field_error`: stub value `sex: "x"` → `{"path": "sex", ...}` in `errors`.
  - `test_hospital_down_gives_503`: a `Hospital` fake raising `HospitalUnavailable` → list and create both `503`, with detail exactly "Hospital system not reachable. Type the RC number and fill the form by hand." (Review Focus 1).
  - `test_unknown_rc_gives_404`: detail "This RC number is not in the hospital system."
  - `test_from_hospital_on_a_photo_form_is_refused`: `radiology_report` + `from_hospital` → 422.
  - `test_manual_creation_has_no_snapshot`: `from_hospital` false → `hospital_snapshot is None`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the migration (copy the 0004 style; `downgrade` drops both columns), the model fields, the route module, the schema fields and the service change. Map exceptions to HTTP: `HospitalUnavailable` → 503, `NotAtHospital` → 404, using the copy above.
- [ ] **Step 4: Run** the full server suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): import a patient's values from the hospital`.

### Task 5: Send back to the hospital on approval

**Files:**
- Create: `server/capture/hospital/sync.py`
- Modify: `server/capture/api/routes_records.py`:
  - `transition` adds a `BackgroundTasks` param;
  - new `POST /records/{id}/hospital-sync`;
  - new `POST /records/{id}/hospital-conflict`.
- Modify: `server/capture/api/schemas.py` (`ConflictIn(key: str, keep: Literal["ours", "hospital"], row_version: int)`)
- Test: `server/tests/test_hospital_sync.py`

**Interfaces:**
- Consumes: Task 4 snapshot and record fields; Task 3 `Hospital.update`.
- Produces:
  - `changes_for_hospital(snapshot: dict | None, values: dict, keys: Iterable[str]) -> tuple[dict, dict]` returns `(set_values, expect)`. Rules:
    - Blank values are never in `set`.
    - **new**: snapshot is missing or `None` for the key and the value is filled → `set` only.
    - **corrected**: the snapshot has a value and the value differs → `set` and `expect[key] = snapshot[key]`.
    - With `snapshot is None` (manual entry), every filled value is new.
  - `sync_record(db: Session, hospital: Hospital, record: Record, actor_id: int | None) -> None` sets `record.hospital_sync` to `{"status": s, "at": iso, "sent": [keys], "conflicts": [...], "error": str | None}`. Status `s` is one of `sent`, `nothing_to_send`, `conflict`, `not_at_hospital`, `unavailable`.
    - It merges applied keys into `hospital_snapshot`. For manual records the snapshot starts as `{}`.
    - It adds `ReviewEvent(action="sync", comment="<s>: <n> sent")`.
    - It bumps `row_version`.
  - After an `approve` on a `hospital: true` template, `transition` schedules `sync_record` in a background task with a fresh session from `request.app.state.sessionmaker`, after the commit.
  - `POST /records/{id}/hospital-sync` (admin, approved hospital records only, else 409) runs `sync_record` at once and returns `RecordDetail`.
  - `POST /records/{id}/hospital-conflict` (admin):
    - `keep="hospital"` sets `field_values[key]` and `hospital_snapshot[key]` to the hospital's value, removes the conflict and records an `edit` event with `field_changes`;
    - `keep="ours"` sets `hospital_snapshot[key]` to the hospital's value, so `expect` matches, then runs `sync_record`.
    - Returns `RecordDetail`.

- [ ] **Step 1: Write the failing tests:**
  - Unit tests for `changes_for_hospital`:
    - `test_new_values_are_sent_without_expect`;
    - `test_corrections_carry_the_old_value`;
    - `test_blanks_are_never_sent`: the snapshot has `age_years: 56` and the value is `None` → not in `set` (Review Focus 3);
    - `test_unchanged_values_are_not_sent`;
    - `test_manual_records_send_every_filled_value`.
  - API tests, through `team` + the stub fixture from Task 4:
    - `test_approval_sends_new_values_and_corrections`: import `RC500001`, fill one blank key and change one hospital key, submit and approve → the stub file holds both, and `hospital_sync.status == "sent"`.
    - `test_nothing_is_sent_before_admin_approval`: after the doctor's submit, the stub is unchanged.
    - `test_try_again_after_success_sends_nothing`: the second `hospital-sync` → status `nothing_to_send` (Review Focus 4).
    - `test_value_changed_at_hospital_becomes_conflict`: after import, edit the stub's `age_years` directly; the doctor changes `age_years` too; approve → status `conflict`, the stub keeps its edit, and other keys are still `sent` (Review Focus 5).
    - `test_keep_hospital_resolves_conflict`;
    - `test_keep_ours_overwrites_after_resolution`;
    - `test_hospital_down_on_approval_marks_unavailable_and_try_again_works`;
    - `test_photo_records_never_sync`: approving a `radiology_report` leaves `hospital_sync is None`.
    - `test_only_admin_can_retry_or_resolve`: the doctor gets 403.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** `sync.py` and the route changes. Lock order: record first, as elsewhere.
- [ ] **Step 4: Run** the full server suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): send new and corrected values to the hospital on admin approval`.

### Task 6: Web — Import patient page

**Files:**
- Create: `web/src/patients/ImportPatientPage.tsx`; delete `NewPatientPage.tsx` and its test
- Create: `web/src/patients/ImportPatientPage.test.tsx`
- Modify: `web/src/App.tsx` (route `import-patient`; `new-patient` → `<Navigate to="/import-patient" replace />`), `web/src/home/HomePage.tsx` + test, `web/src/patients/PatientPage.tsx`, `web/src/patients/PatientsPage.tsx` + test, `web/src/patients/summary.ts` (`NEW_PATIENT_FORM = "import_patient"`), `web/src/capture/TemplateStep.tsx` (it already lists only photo kinds; also skip `definition.retired`)
- Modify: `web/src/api/hooks.ts` (`useHospitalPatients(form: string)`), `web/src/api/types.ts` (`HospitalPatient { rc: string; imported: boolean }`, `RecordDetail.hospital_snapshot`, `hospital_sync: HospitalSync | null`, `HospitalSync`)

**Interfaces:**
- Consumes: Task 4 endpoints; `CreateMeta.from_hospital`.
- Produces:
  - Route `/import-patient?form=<key>&patient=<RC>`.
  - Home `ActionCard to="/import-patient"` with title "Import patient" and text "From the hospital system".

Page behaviour:
1. Three form buttons appear, from templates with `definition.hospital && !definition.retired`, `import_patient` first and selected by default.
2. A search box filters the RC list (up to 50 matches shown) as buttons. Each shows the RC and a ✓ "imported" mark.
3. Picking an RC posts `/records` with `from_hospital: true` and goes to `/records/:id`.
4. **"Not in the list? Type the RC number"** shows the old typed-RC input and posts with `from_hospital: false`.
5. A 503 from the list or the create shows the hospital-down copy and switches to the typed input by itself. A 409 keeps the existing "already has a first-visit form · Open RC…" message. A 404 shows the unknown-RC copy plus the typed input.

- [ ] **Step 1: Write the failing tests** (msw or the existing fetch-mock pattern in `NewPatientPage.test.tsx`):
  - `lists hospital RC numbers and marks imported ones`;
  - `typing filters the list`;
  - `picking an RC creates the record from the hospital and opens it`: meta has `from_hospital: true`, `template_key: "import_patient"`;
  - `choosing Treatment sends template_key treatment`;
  - `hospital down shows the message and opens manual entry` (Review Focus 1);
  - `manual entry posts from_hospital false and validates RC`;
  - `?patient=RC55 prefills the search`;
  - home test: link "Import patient" → `/import-patient`.
- [ ] **Step 2: Run** `cd web && npm test -- ImportPatientPage HomePage PatientsPage`. Expected: FAIL.
- [ ] **Step 3: Implement** the page with the existing `inputClass`, `primaryButton`, `secondaryButton` and `Notice`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Import patient page with the hospital's RC list`.

### Task 7: Web — hospital tags, change warnings, auto BMI/pack-years, approval list, sync line

**Files:**
- Create: `web/src/records/hospital.ts` and `web/src/records/hospital.test.ts`
- Create: `web/src/records/HospitalSync.tsx` and `web/src/records/HospitalSync.test.tsx`
- Modify: `web/src/records/FormRenderer.tsx`:
  - new prop `hospital?: Record<string, unknown> | null`, carried in `Context`;
  - `Notes` shows the tag and the warning;
  - `Section` starts closed when every one of its fields came unchanged from the hospital.
- Modify: `web/src/records/RecordPage.tsx`:
  - pass `hospital={r.hospital_snapshot}`;
  - wrap `onChange` with `withDerived`;
  - an inline confirm panel before `submit` and `approve` when there are corrections;
  - render `<HospitalSync>` for hospital templates.
- Test: `web/src/records/FormRenderer.test.tsx` (new cases)

**Interfaces:**
- Consumes: Task 6 types; Task 5 endpoints (`hospital-sync`, `hospital-conflict`).
- Produces:
  - `hospitalChanges(snapshot: Record<string, unknown> | null, values: Record<string, unknown>, fields: FieldDef[]): { corrections: { key: string; label: string; from: unknown; to: unknown }[]; newCount: number; cleared: string[] }`. Its rules match `changes_for_hospital` in Task 5.
  - `withDerived(values: Record<string, unknown>): Record<string, unknown>`:
    - fills `bmi` (1 decimal, `kg / (cm/100)²`) when `weight_kg` and `height_cm` are numbers and `bmi` is empty;
    - fills `pack_years` (1 decimal, `sticks_per_day / 20 × smoking_years`) when both are numbers and `pack_years` is empty;
    - never overwrites a filled value.
  - `<HospitalSync record={RecordDetail} canAct={boolean} onDone={(r: RecordDetail) => void} />` shows:
    - `nothing yet` → "Not sent to the hospital yet";
    - `sent` → "Sent to hospital {date}";
    - `nothing_to_send` → "Nothing new for the hospital";
    - `unavailable` → "Hospital not reachable";
    - `not_at_hospital` → "Not at hospital";
    - `conflict` → "Conflict", with one row per key: "Hospital now has X; we had Y; you approved Z", and the buttons **Keep hospital's** / **Keep ours**.
    - Admins also get **Try again** for `unavailable` and `conflict`.

- [ ] **Step 1: Write the failing tests:**
  - `hospital.test.ts`:
    - corrections / new / cleared counted as in Task 5's unit tests;
    - `withDerived` fills BMI 70 kg / 170 cm → 24.2;
    - pack-years 10 a day × 20 years → 10;
    - a filled value is not overwritten.
  - `FormRenderer.test.tsx`:
    - `shows From hospital on unchanged hospital values`;
    - `warns with the exact copy when a hospital value is changed`;
    - `warns that a cleared hospital value is kept by the hospital` (Review Focus 3);
    - `no tag on fields the hospital lacked`;
    - `a section entirely from the hospital starts closed`.
  - `HospitalSync.test.tsx`:
    - each status's text;
    - conflict rows and their two buttons call `/hospital-conflict` with `keep`;
    - **Try again** posts `/hospital-sync`;
    - doctors see no buttons.
  - The RecordPage confirm panel is covered via `FormRenderer`'s neighbours: add `RecordPage` test `approve with corrections lists old → new before sending`, if a RecordPage test harness exists. Otherwise add a small `ApproveChanges` component in `HospitalSync.tsx` and test it there.
- [ ] **Step 2: Run** `npm test -- hospital FormRenderer HospitalSync`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): hospital tags, change warnings and the hospital sync line`.

### Task 8: End-to-end story and demo data

**Files:**
- Modify: `web/e2e/flow.spec.ts`. Replace the "New patient" steps: Import patient → pick `RC500001` → a field shows "From hospital" → change one hospital value and see the warning → fill the required blanks → doctor approves (the confirm lists the correction) → admin approves → the record shows "Sent to hospital". Export contains `import_patient.csv`.
- Modify: `server/capture/devserver.py` only if the stub file path must be pinned to the dev data folder. It already follows `storage_dir`, which devserver sets.
- Modify: `docs/demo.md` (Import patient, the stand-in hospital, SSD for scans)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Update** `flow.spec.ts` as described, keeping the story serial.
- [ ] **Step 2: Run** `cd web && npm run e2e`. Expected: all steps pass. Ports 8000 and 5173 must be free.
- [ ] **Step 3: Run** `cd server && uv run --frozen pytest -q` once more. Expected: PASS.
- [ ] **Step 4: Commit** `test(e2e): import a patient from the hospital through to sending back`.

### Task 9: Windows app

**Files:**
- Create (generated, then edited): `mobile/windows/` via `flutter create --platforms=windows .`
- Modify: `mobile/windows/runner/main.cpp` (window title "AMCGH Capture", initial size 1280×800), `mobile/windows/runner/resources/app_icon.ico` (from the existing app icon PNG, converted with Pillow: `uv run --no-project --with pillow python -c ...` to 16/32/48/256 sizes)
- Modify: `mobile/lib/main.dart`: on Windows, skip `SystemNavigator.pop`; the back handling is Android-only. Guard with `defaultTargetPlatform == TargetPlatform.android`.
- Create: `mobile/windows/installer.iss` (Inno Setup: app name "AMCGH Capture", installs `build\windows\x64\runner\Release\*` to `{autopf}\AMCGH Capture`, Start-menu and desktop shortcuts, output `mobile/build/AMCGH-Capture-Setup.exe`)
- Modify: `mobile/README.md` (Windows build and install steps)

- [ ] **Step 1: Generate the Windows target.** `cd mobile && flutter create --platforms=windows .` Expected: `windows/` created, no errors.
- [ ] **Step 2: Build.** `flutter build windows --release --dart-define=APP_URL=https://adynamic-trinh-thickly.ngrok-free.dev`. Expected: `build\windows\x64\runner\Release\amcgh_capture.exe`. If flutter_inappwebview 6.2.0-beta.3 fails on Windows, stop and report the error with the version; do not swap plugins without asking.
- [ ] **Step 3: Smoke run.** Start the exe, wait 8 s, and check the process is alive and its window title is "AMCGH Capture" (`Get-Process | Where MainWindowTitle -eq 'AMCGH Capture'`), then stop it. With the server running, a screenshot of the login page is the evidence.
- [ ] **Step 4: Installer.** If `ISCC.exe` is missing, ask the user before `winget install JRSoftware.InnoSetup`. Run `ISCC mobile\windows\installer.iss`. Expected: `mobile/build/AMCGH-Capture-Setup.exe`. Fallback if refused: zip the Release folder to `mobile/build/AMCGH-Capture-windows.zip`, and say so.
- [ ] **Step 5: Run** `flutter test` in `mobile/`. Expected: PASS (the Android behaviour is unchanged).
- [ ] **Step 6: Commit** `feat(mobile): Windows desktop app`. Commit the source only; `build/` stays ignored.

### Task 10: Final check and hand-off

- [ ] **Step 1:** Run, from a clean clone of the branch (`git clone -b feat/import-patient K:\Ahsania <scratch>\verify`):
  - server suite;
  - `npm ci && npm test && npm run typecheck && npm run build`;
  - e2e.

  Record the counts.
- [ ] **Step 2:** Self-review the branch diff against the spec's goals list and the Review Focus. Fix anything found, then commit.
- [ ] **Step 3:** Update `.superpowers/HANDOFF.md` and memory (`hospital-sender.md` stays separate; add `import-patient.md`). Do not merge or push; the user decides.
