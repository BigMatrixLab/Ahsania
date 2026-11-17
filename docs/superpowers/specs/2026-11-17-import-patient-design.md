# Import Patient, Two-Way Hospital Sync and Windows App — Design

**Date:** 2026-11-17
**Status:** Approved by the user 2026-11-17
**Changes:** `2026-10-05-two-panels-design.md` and the forms in `templates/`. Where they disagree, this document wins.
**Source of the variables:** `lung_ai_proposal_with_variables (2).pdf`, Appendix A.1 (102 clinical variables agreed with AMCGH's clinical team) and A.2 (what the app's forms already record).

## Why

The proposal (§5.3–5.4) promises a platform that pulls patient fields from the hospital's records and writes checked fields back. Today a doctor photographs a sheet and the app reads it. AMCGH already holds much of each patient's data in its own software, so doctors should not retype it. The hospital software does not hold every study variable, so the app fills the gaps and sends them back. Both sides then hold the complete record.

## Goals

1. **Import patient** replaces "New patient (lung cancer)". The doctor picks an RC number from a dropdown of the hospital's patients. Every variable the hospital has fills in. The rest stay blank for the doctor to type.
2. The form holds every A.1 variable from sections 1–10, merged with the current first-visit fields. No name, address, phone, national ID or date of birth.
3. Two new follow-up forms work the same way: **Treatment** (A.1 §11) and **Toxicity & outcome** (A.1 §12).
4. **Two-way sync.** Values the hospital did not have are sent to the hospital. Values the doctor changed from the hospital's go back too, after a warning and approval by both a doctor and an admin.
5. **Manual fallback.** If the hospital system is down or the RC number is not there, the doctor can type the RC number and fill the form by hand.
6. **Windows app.** An installable Windows program that opens the same app in its own window, beside the existing Android app.

## Non-goals

- Photos or OCR on the three hospital-linked forms (user: "API + typing only").
- Changes to the photo forms (radiology report, X-ray film photo, CT/MRI film photo, DICOM series, clinical summary, pathology/molecular report, lab report).
- A Mac app.
- The real hospital connection. AMCGH's API is not known yet ([visit checklist](../../hospital-sender/visit-checklist.pdf)). The app is built against a stand-in hospital with made-up patients. The real one plugs in by settings once hospital IT builds it to the contract below.
- The hospital sender program from `2026-11-10-hospital-sender-design.md`. That one moves scan files; this one moves form variables.

## Anti-goals

- Overwriting a hospital value without a warning and a two-person approval.
- Overwriting a value someone changed at the hospital after we imported it.
- Any patient-identifying variable in our database or in what we send, other than the RC number.
- Making doctors wait on the hospital system: if it is slow or down, they can still work by hand.

## Decided by the user (2026-11-17)

| Topic | Decision |
| --- | --- |
| Name | "New patient" becomes **Import patient**. |
| Variables | Add the PDF's variables; no identifying variables except the RC number. |
| Form split | Import patient = first-visit (A.1 §1–10). Treatment (§11) and Toxicity & outcome (§12) are separate forms. |
| Follow-up forms | Same flow as Import patient: pick RC, auto-fill, type the rest, no photos. They replace the old photo-based `treatment_sheet` and `outcome_followup`. |
| Photos | None on these three forms. |
| Hospital API | Details not known yet; build with a stand-in. |
| Hospital values | Editable, with a "from hospital" tag. |
| Changing a hospital value | The doctor sees a warning. The change is sent to the hospital once a doctor and an admin have both approved it. |
| Admins | Both the NSU team and hospital IT staff hold admin accounts. |
| Variables the hospital lacks | Hospital IT adds those fields to their software. |
| Desktop | Windows app (.exe), same screens and server. |
| When values go to the hospital | On admin approval, for new values and corrections alike. |

## The three forms

Template conventions stay as in `templates/*.yaml`, and keys follow the existing `^[a-z][a-z0-9_]*$` pattern. Each new form carries `hospital: true` (new template flag, see Server), and has no pages.

### 1. `import_patient` (replaces `new_patient_lung`)

It keeps every field of `new_patient_lung` v1 with the same key, type and section, and the same required set: `visit_date`, `age_years`, `sex`, `smoking_status`, `ecog`. The changes and additions below bring in A.1 §1–10.

**Changed existing fields**

| Key | Change | Reason |
| --- | --- | --- |
| `age_years` | Label "Age at diagnosis (years)" | A.1 §1 |
| `residence` | Options urban / rural / semi-urban | A.1 §1 |
| `tobacco_type` | Options cigarette / bidi / both cigarette and bidi / cigar / pipe / hookah / other | Merge of A.1 §2 and current |
| `smokeless_tobacco` | Becomes enum never / current / former (was Yes/No) | A.1 §2 |
| `work_exposure` | Options gain dust and metal | A.1 §3 |
| `past_copd` | Label "COPD" (asthma moves to its own field) | A.1 §4 |
| `family_history` | Options none / lung cancer / breast cancer / colorectal cancer / other cancer / not known | A.1 §4 |
| `primary_site` | Options gain "multiple" | A.1 §6 |
| `m_stage` | Options M0 / M1a / M1b / M1c / M1c1 / M1c2 | A.1 §9 |
| `met_brain` … `met_lung_pleura` | `show_if` moves to `distant_mets = yes` | A.1 §8 |

**New fields (40)**

| Section | Key | Label | Type / values |
| --- | --- | --- | --- |
| Patient and visit | `pollution_source` | Lives near | industrial area / highway or major road / residential area / other |
| Patient and visit | `education` | Education | no formal education / primary / secondary / higher secondary / graduate or above |
| Smoking and tobacco | `smoking_start_age` | Age started smoking | number, years 5–100; if former/current |
| Smoking and tobacco | `smoking_years` | Years smoked | number 0–100; if former/current |
| Smoking and tobacco | `sticks_per_day` | Cigarettes or bidis a day | number 0–200; if former/current |
| Smoking and tobacco | `smoking_stop_age` | Age stopped smoking | number 5–120; if former |
| Smoking and tobacco | `smokeless_type` | Type of smokeless tobacco | jarda / gul / sadapata / other; if smokeless current/former |
| Other exposures | `passive_smoke_years` | Years with smokers | number 0–100; if passive_smoke = yes |
| Other exposures | `work_exposure_years` | Years of dust or fumes at work | number 0–80; if work_exposure ≠ none |
| Other exposures | `biomass_years` | Years cooking with wood, dung or straw | number 0–100; if biomass_fuel = yes |
| Past history | `family_first_degree` | Parent, sibling or child affected | boolean; if family_history is a cancer |
| Past history | `past_asthma` | Asthma | boolean |
| Past history | `past_pneumonia` | Pneumonia or COVID-19 pneumonia before | boolean |
| Past history | `past_other_lung` | Other chronic lung disease | boolean |
| Symptoms | `diagnosis_date` | Date of diagnosis | date |
| Symptoms | `symptom_fever` | Fever | boolean |
| Symptoms | `symptom_other` | Other symptoms | text |
| Examination | `bmi` | BMI | number, kg/m², filled automatically from weight and height, editable |
| Diagnosis and stage | `tumor_side` | Side | right lung / left lung / both |
| Diagnosis and stage | `tumor_location` | Location | central / peripheral |
| Diagnosis and stage | `primary_lesion_count` | Number of primary lesions | number 1–20 |
| Diagnosis and stage | `histology_grade` | Grade | well / moderately / poorly differentiated / not applicable |
| Diagnosis and stage | `biopsy_type` | Biopsy specimen | bronchoscopy / CT-guided biopsy / surgical biopsy / cytology / other |
| Diagnosis and stage | `node_involved` | Regional lymph nodes involved | boolean |
| Diagnosis and stage | `distant_mets` | Distant metastasis | boolean |
| Diagnosis and stage | `met_other` | Other metastatic site | text; if distant_mets = yes |
| Diagnosis and stage | `met_site_count` | Number of metastatic sites | number 0–20; if distant_mets = yes |
| Molecular and biomarkers | `molecular_tested` | Molecular testing done | boolean |
| Molecular and biomarkers | `mol_egfr`, `mol_alk`, `mol_ros1`, `mol_kras`, `mol_braf`, `mol_met`, `mol_ret`, `mol_ntrk`, `mol_her2` | EGFR mutation, ALK, ROS1, KRAS, BRAF, MET, RET, NTRK, HER2 | each positive / negative / not tested / unknown; if molecular_tested = yes |
| Molecular and biomarkers | `pdl1_level` | PD-L1 expression | <1% / 1–49% / ≥50% / unknown |
| Molecular and biomarkers | `pdl1_method` | PD-L1 test | IHC / other |
| Molecular and biomarkers | `molecular_method` | Molecular test method | PCR / NGS / FISH / IHC / other |

`pack_years` fills automatically as `sticks_per_day ÷ 20 × smoking_years` when both are present and it is blank. The doctor can still change it.

### 2. `treatment` (new; replaces `treatment_sheet`)

One record per treatment update. The required fields are `treatment_date` (document date) and `treatment_intent`.

| Key | Label | Type / values |
| --- | --- | --- |
| `treatment_date` | Date | date, required |
| `previous_treatment` | Treated before | boolean |
| `treatment_intent` | Intent | curative / palliative, required |
| `mdt_planned` | Planned at multidisciplinary meeting | boolean |
| `surgery` | Surgery | boolean |
| `surgery_type` | Type of surgery | lobectomy / pneumonectomy / wedge resection / segmentectomy / other; if surgery |
| `surgical_margin` | Margin | R0 / R1 / R2 / unknown; if surgery |
| `chemotherapy` | Chemotherapy | boolean |
| `chemo_line` | Line | 1st / 2nd / 3rd / other; if chemo |
| `chemo_regimen` | Regimen | taxane + platinum / gemcitabine + platinum / pemetrexed + platinum / platinum + etoposide / other; if chemo |
| `chemo_regimen_other` | Other regimen | text; if regimen = other |
| `chemo_cycles` | Number of cycles | number 0–100; if chemo |
| `radiotherapy` | Radiotherapy | boolean |
| `rt_intent` | RT intent | definitive / adjuvant / neoadjuvant / palliative; if RT |
| `rt_technique` | RT technique | 3D-CRT / IMRT / VMAT / SBRT / other; if RT |
| `rt_dose_gy` | RT dose | number, Gy 0–150; if RT |
| `rt_fractions` | Fractions | number 0–60; if RT |
| `rt_start_date`, `rt_end_date` | RT from / to | date; if RT |
| `concurrent_chemort` | Concurrent chemoradiotherapy | boolean |
| `immunotherapy` | Immunotherapy | boolean |
| `immuno_agent` | Drug | pembrolizumab / nivolumab / durvalumab / atezolizumab / other; if immunotherapy |
| `immuno_agent_other` | Other drug | text |
| `targeted` | Targeted therapy | boolean |
| `targeted_agent` | Drug | osimertinib / gefitinib / alectinib / crizotinib / entrectinib / sotorasib / erlotinib / afatinib / adagrasib / trastuzumab deruxtecan / other; if targeted |
| `targeted_agent_other` | Other drug | text |
| `treatment_completion` | Completion | completed / interrupted / not completed |
| `treatment_interrupted` | Interrupted | boolean |
| `interruption_reason` | Reason | toxicity / financial constraints / disease progression / poor performance status / patient refusal / other; if interrupted |
| `interruption_reason_other` | Other reason | text |

### 3. `toxicity_outcome` (new; replaces `outcome_followup`)

One record per follow-up. `followup_date` (document date) and `vital_status` are required.

| Key | Label | Type / values |
| --- | --- | --- |
| `followup_date` | Date of follow-up | date, required |
| `toxicity` | Treatment-related toxicity | boolean |
| `toxicity_type` | Toxicity type | hematological / GI / pulmonary / skin / neurological / other; if toxicity |
| `toxicity_type_other` | Other toxicity | text |
| `toxicity_grade` | Grade (CTCAE) | 1 / 2 / 3 / 4 / 5; if toxicity |
| `cxr_6weekly` | 6-weekly chest X-ray during treatment | boolean |
| `disease_status` | Disease status | no evidence of disease / stable disease / partial response / complete response / progressive disease |
| `progression` | Recurrence or progression | boolean |
| `progression_date` | Date of progression | date; if progression |
| `progression_site` | Site of progression | text; if progression |
| `pfs_months` | Progression-free period | number, months 0–600 |
| `vital_status` | Vital status | alive / dead / lost to follow-up, required |
| `date_of_death` | Date of death | date; if dead |
| `cause_of_death` | Cause of death | lung cancer / treatment-related / other; if dead |

**Phase note.** The proposal (§6) says the treatment and outcome variables are requested only after the Phase 1–2 tools are validated. The user chose to include them now. The templates are marked `phase: 1` so they can be used. Whether the hospital may share them yet is for AMCGH and the ethics committee to decide.

`new_patient_lung`, `treatment_sheet` and `outcome_followup` are hidden from new captures. Their old records still open and export.

## Doctor flow

1. **New capture → choose form.** The three hospital-linked forms come first, under "From hospital". The photo forms follow, unchanged.
2. **Patient number.** A searchable dropdown lists the RC numbers from the hospital, newest first. RC numbers we have already imported for this form show a tick. Typing narrows the list. Below it, **"Not in the list? Type the RC number"** opens a text box (the existing `RC` + digits rule) for manual entry. If the hospital system cannot be reached, the dropdown says so and the text box opens by itself.
3. **Form.** The fields the hospital had are filled in and carry a small **"from hospital"** tag. Fields it lacked are empty. Sections where every field came from the hospital start collapsed. Autosave works as it does now.
4. **Changing a hospital value.** As soon as the value differs, a warning shows under the field: "Hospital has *56*. If you and an admin approve, the hospital's value will be changed to *58*." Setting it back to the hospital's value clears the warning.
5. **Approve and send to admin**, as now. The approval box lists every hospital value being changed, old → new, and asks the doctor to confirm.

## Admin flow

Admins are the NSU team and hospital IT; no new role is needed.

- On the record page, the admin sees the same list of hospital values being changed, plus a count of new values for the hospital.
- **Approve** sends the record to the hospital. **Send back** works as now.
- Each hospital-linked record shows a sync line: *Not sent* / *Sent to hospital (date)* / *Hospital refused: reason* / *Conflict*, with **Try again**.
- **Conflict:** if the hospital's current value for a key differs from what we imported, someone changed it at the hospital meanwhile. That key is not sent. The admin sees "Hospital now has X; we had Y; you approved Z" and picks which value to keep. Keeping Z sends it, keeping the hospital's value updates ours.

## What is sent to the hospital

On admin approval the server works out, for each key in the form:

- **new**: blank when imported and filled now → sent.
- **corrected**: imported with a value and changed now → sent, with the imported value as the expected old value.
- **unchanged**: not sent.

Records entered by hand (no import) send all filled values as **new**. If the hospital does not know the RC number, the sync line says "Not at hospital" and nothing is sent. The record stays with us.

## Hospital API contract (what we ask hospital IT to build)

Using our variable keys as their field names keeps the mapping trivial. Hospital IT adds the variables they lack. This contract is written up for them as part of this work.

- `GET /patients?updated_since=` → `[{"rc": "RC12345", "updated_at": "..."}]`
- `GET /patients/{rc}?form=import_patient|treatment|toxicity_outcome` → `{"rc": "...", "values": {"age_years": 56, "sex": "male", ...}, "updated_at": "..."}`. For the per-visit forms this is the latest visit; how the hospital lists earlier visits is an open question for hospital IT.
- `PATCH /patients/{rc}` with `{"form": "...", "set": {"key": value}, "expect": {"key": old_value}}` → `200 {"applied": [...], "conflicts": [{"key": "...", "hospital_value": ...}]}`. A key whose `expect` does not match is not written and comes back as a conflict.
- HTTPS. A bearer token per client. No patient name, address, phone, national ID or date of birth in any response or request.
- Values: dates as `YYYY-MM-DD`, booleans as `true`/`false`, enums as our option strings.

## Server changes

- **`capture/hospital/`**: a small interface (`list_patients`, `get_patient`, `update_patient`) with two versions.
  - `stub`: the stand-in hospital, about 30 made-up patients in a JSON file in the dev data folder. Some variables are filled and some are blank, so both paths show. Writes go to that file. A few RC numbers are set up to produce a conflict, so the conflict path can be tested.
  - `http`: the real client for the contract above.
- **Settings**: `CAPTURE_HOSPITAL` = `stub` (default for dev and the public run) or `http`, plus `CAPTURE_HOSPITAL_URL`, `CAPTURE_HOSPITAL_TOKEN` and `CAPTURE_HOSPITAL_TIMEOUT_S` (default 10).
- **Template flag** `hospital: true` on the three forms. Such records need no pages, get no extraction job, and are created directly as `draft`.
- **API**:
  - `GET /api/hospital/patients?form=` → RC list plus "already imported" ticks.
  - `GET /api/hospital/patients/{rc}?form=` → prefill values.
  - `POST /api/records` accepts a hospital record with values and the import snapshot, and no pages.
  - Admin `POST /api/records/{id}/hospital-sync` retries the sync.
- **Record data**: `hospital_snapshot` (values as imported, null when entered by hand) and `hospital_sync` (status, time, conflicts, last error). It is a new table or columns, with a migration.
- **Sync on approval** runs as a job in the existing job queue, so a slow hospital never blocks the admin's click. Failures retry with backoff, and the record shows the status.
- **Review trail**: import, every hospital-value change, and each sync result are written to `review_events`.
- **Export**: the three forms appear in the dataset export like any form. The new fields are just new columns.

## Web changes

- Home: the **New capture** card reads "New capture"; the form list shows the "From hospital" group first, with Import patient at the top.
- The wizard gets a new step, **Patient number (from hospital)**, which takes the place of Photos and Patient ID for hospital forms.
- Form fields get the "from hospital" tag and the change warning, using the existing field component.
- The approval boxes for doctor and admin list the corrections.
- The record page shows the sync line and its conflict picker.
- Works at phone width and at desktop width (two columns of fields on wide screens).

## Windows app

- The existing Flutter shell in `mobile/` gains a Windows target (`flutter create --platforms=windows .`), so one codebase serves Android and Windows. `flutter_inappwebview` supports Windows through Microsoft Edge WebView2, which ships with Windows 10 and 11.
- It opens the same server URL as the Android app (`APP_URL`), in a resizable window titled "AMCGH Capture" with the app icon.
- It is packaged as one installer `.exe` (Inno Setup) that adds a Start-menu and desktop shortcut. If Inno Setup cannot be used, a zip with the program folder is the fallback.
- Photo forms on Windows use the file picker; the camera is not needed.

## My calls (not yet agreed; change any)

- Where A.1 and the current form disagree, I keep the more detailed of the two: T stage keeps T1a–T4/TX, stage keeps IA1–IVB plus small-cell, occupation keeps the current list, ECOG stays 0–4 (5 means dead and does not apply at a first visit).
- `age_years` is used for "age at diagnosis" rather than adding a second age field.
- `bmi` and `pack_years` fill automatically but stay editable.
- Nodal station is covered by `n_stage`; metastatic sites keep the current five yes/no fields plus `met_other`.
- The hospital's current value is compared before writing, and conflicts never overwrite.

- Records entered by hand for an RC number the hospital does not know are not pushed.
- Old forms are hidden, not deleted.
- Desktop installer via Inno Setup.

## Left to the builder

- Table versus column layout for the snapshot and sync status.
- The stand-in's made-up patient values.
- How the dropdown pages through a long RC list.
- Retry timings for sync.

## Open (needs hospital IT)

1. Whether they will build the API to this contract, or what theirs looks like instead.
2. How the per-visit forms (treatment, follow-up) map to their records: one per visit, or latest only.
3. The list of our variables they will add, and when.
4. Whether writing back to their records needs separate approval (hospital management, ethics committee).
5. The server address and token for the real connection, and whether our server can reach theirs (network, firewall).
