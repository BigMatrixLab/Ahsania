# Showing the app to the board of doctors

About 5 minutes. Everything shown is made-up data; every sample photo is marked SYNTHETIC.

## The day before

1. Print `eval/test-sheet.pdf`. Page 1 is a typed report (patient RC204518). Page 2 is blank; handwrite something made up on it.
2. Start the app on this PC (it needs no GPU):
   `powershell -ExecutionPolicy Bypass -File run-public.ps1 -Reset -Demo`
   `-Reset` wipes this demo's records; `-Demo` adds six sample patients. Leave out both flags to keep what is there.
3. Open https://adynamic-trinh-thickly.ngrok-free.dev on your phone, or install the APK from `mobile/build/app/outputs/flutter-apk/app-release.apk`.
4. Walk the whole story once on that phone, on the room's network, with the printed sheet. Delete that test capture afterwards.

Logins are `doctor` and `admin`; the password is in `.public-password`. Keep this PC awake and plugged in during the meeting.

## The story

**1. A patient comes in.** Log in as `doctor`, tap **Import patient** and pick `RC500001` from the hospital list (a stand-in hospital with 30 made-up patients until AMCGH IT connects the real one). Fields the hospital has show **From hospital**; the rest are empty for the doctor. Change the age and the form warns that the hospital's value will change once a doctor and an admin approve. Tap **Approve and send to admin**: the change is listed first. To show the empty form, tap **Not in the list? Type the RC number** and type `RC300001`; tapping **Approve and send to admin** early says what is still needed and takes you there.

**2. A report arrives.** Tap **New capture**, **Radiology report**, photograph page 1, tap **Use this page**, then **Continue**. The patient ID is read off the photo. Tap **Fill it from the photo**.

**3. The doctor stays in charge.** The form is filled in. Tap any field: the part of the photo it was read from appears right under it. Change one value, then approve.

**4. Handwriting.** Say plainly that it is not read automatically. Capture page 2 with **I'll fill it myself** and show the photo beside the form.

**5. The admin's view.** Log in as `admin`, open the record: it reads like a chart. Send it back with a comment, or approve it.

**6. What the study gets.** Open **Patients**. RC100001 shows who the patient is and a CT and X-ray pair, with the days between them. Patients without a pair say what they still need. **Download dataset** gives one ZIP of approved records.

## What is real, and what is not

| Say this | Because |
|---|---|
| The reading is real, on an ordinary computer, with no AI service and no GPU | PaddleOCR and plain rules, on the CPU |
| It takes a few seconds a page on this PC | Measured 6 s a page; a slower server takes longer |
| It scored 100% on 20 made-up test documents | True, but the rules were written knowing how those are worded. **Do not quote this as accuracy on real reports** |
| Real AMCGH reports have not been tried yet | The rules may need tuning to the hospital's own wording |
| Every field is checked by a doctor, then an admin | Nothing reaches the dataset without both |

## Questions they may ask

- **Handwriting?** Not read automatically today; the doctor types it beside the photo. A model on a GPU server may help later.
- **Our report looks different.** Ask for a sample with patient details covered. A field the rules cannot read stays blank; it is not guessed.
- **Who sees patient names?** Photos are stored as taken, on the server. Removing names is a separate NSU step and is not in this app yet. Do not describe it as built in.
- **Is clinical data allowed now?** The MoU and proposal hold clinical data for Phase 3. The first-visit form is shown for their review; they decide when it may be used.
- **Are these the right questions on the form?** This is what we want them to tell us. Fields are easy to change.
- **Where does it run?** On this PC for today. The pilot needs a computer that stays on during working hours, ideally at NSU. No GPU is needed.
- **DICOM and the hospital system?** Scans come by SSD for now. The hospital link is built against a stand-in; AMCGH IT gets `docs/hospital-api.md`, the three calls we need, to connect the real system.
