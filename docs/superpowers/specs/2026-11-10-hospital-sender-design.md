# Hospital Sender — Design

**Date:** 2026-11-10
**Status:** Draft. Written before anyone has seen the hospital's software or PC. The visit checklist (`docs/hospital-sender/visit-checklist.pdf`) collects the missing answers; update this document once they are in.
**Relates to:** `2026-10-05-two-panels-design.md` (the capture app). This is a separate program; the capture app is not changed except for one new upload address on the server.

## Why

The research (proposal Phases 1-2) needs AMCGH's X-ray and CT files and their reports. Today the plan is to carry scans to NSU on an SSD. That depends on someone remembering, and files get missed. The hospital sender replaces the SSD: a small program on a hospital PC that, every 3 days, zips the new files and uploads them to the NSU server by itself.

Success: files that appear on the hospital PC reach NSU within about 3 days, each one exactly once, with nobody at the hospital having to do anything after setup.

## Goals

- Runs on one Windows PC at AMCGH, with no window and no daily action by staff.
- Every 3 days, collects every file added or changed since the last successful send, from one or more folders, into one zip.
- Uploads the zip to the NSU server over HTTPS. If the internet is down or the upload breaks, it keeps the zip and tries again; nothing is lost and nothing is sent twice.
- Never changes, moves or deletes the hospital's files. Read-only.
- Leaves a plain log on the PC so hospital staff can see when it last sent.
- NSU can see what arrived and when, and can tell when the hospital has gone quiet.

## Non-goals (for now)

- Reading the hospital's own software or database. We do not know what it is yet. The first version reads folders only; a reader for their system can be added after the visit.
- Removing patient names. The user said the files on the hospital PC carry no patient names. **The visit must confirm this**, including inside scan files (DICOM headers have a patient-name field).
- Unzipping, sorting or matching files to capture-app records at NSU. Batches are stored as they arrive.
- Any change to the doctor or admin screens of the capture app, apart from an optional "hospital uploads" list (see NSU side).

## Anti-goals (would make it a failure even if it works)

- Sending files of patients who are not in the study, if the ethics approval or MoU limits it to study patients. The filter rule must come from the visit, not a guess.
- Slowing down or breaking the hospital's own systems (PACS, hospital software, network during working hours).
- Something hospital IT cannot understand or switch off. It must be one program, one settings file, one scheduled task.
- Silent failure: stopping for weeks without anyone noticing.

## Constraints

- Hospital PC: Windows, version unknown (could be old). No admin rights assumed until confirmed.
- Internet at the hospital: speed, data cap and firewall unknown. A 3-day batch with CT scans could be several GB.
- The current "NSU server" is the capture app running on a lab PC behind a free ngrok link (`run-public.ps1`). That is fine for testing but not for months of multi-GB uploads; a real always-on NSU server is needed before go-live.
- Keep it simple: one small program, no installer wizard, no extra services.

## How it works

### Hospital side: `sender.exe`

One file plus one settings file, in a folder such as `C:\NSU-Sender\`:

```text
C:\NSU-Sender\
  sender.exe
  sender.ini        settings (below)
  state.db          which files were already sent (created by the program)
  outbox\           zips waiting to upload
  sender.log        one line per run
```

`sender.ini`:

```ini
[server]
url   = https://<nsu-server>/api/hospital
token = <secret given by NSU for this PC>

[collect]
folders    = D:\Reports; E:\PACS-Export      ; one or more, filled in after the visit
extensions = .dcm .pdf .docx .jpg             ; empty = all files
every_days = 3
quiet_minutes = 10                            ; skip files changed in the last 10 min (still being written)

[upload]
chunk_mb   = 20
```

Windows Task Scheduler runs `sender.exe run` once a day (time from the visit, default 23:00). Each run:

1. **Retry first.** Upload anything already waiting in `outbox\`.
2. **Is it time?** If fewer than `every_days` days have passed since the last successful batch, stop. A daily check means a PC that was off on the due day catches up the next day.
3. **Find new files.** Walk the folders. A file is new if its path, size or modified time differs from `state.db`. Skip files modified in the last `quiet_minutes`.
4. **Zip.** Write `outbox\AMCGH_<from-date>_<to-date>_<batch-id>.zip` keeping the folder structure, plus `manifest.json` inside: batch id, PC name, sender version, date range, and per file its path, size, modified time and SHA-256. Use ZIP64 (batches can pass 4 GB). Store already-compressed files (DICOM is often compressed, JPG, PDF) without recompressing.
5. **Upload** in chunks (below). On success, mark those files as sent in `state.db` and delete the zip from `outbox\`.
6. **Log** one line: date, files, size, result.

`sender.exe status` prints the last successful send and anything waiting. `sender.exe test` checks the settings, the folders and the connection to NSU without sending files.

### Upload: resumable chunks

A multi-GB upload over a hospital line will break. The upload is split:

1. `POST /api/hospital/batches` with the manifest → server returns an upload id (or says "already have it" if the batch id is known — this makes retries safe).
2. `PUT /api/hospital/batches/{id}/chunks/{n}` for each `chunk_mb` piece. Server answers with which chunks it holds, so a retry skips the ones already there.
3. `POST /api/hospital/batches/{id}/complete` → server joins the chunks, checks the zip's SHA-256 and every file in the manifest, then answers OK. Only then does the sender mark files sent.

Every request carries `Authorization: Bearer <token>`. HTTPS only.

### NSU side: additions to the existing server

- **Token per hospital PC.** Created by an admin with a CLI command (e.g. `capture sender-token create AMCGH-PACS-PC`), stored hashed. Can be revoked.
- **The three upload addresses above**, accepting only sender tokens (not doctor/admin logins). Chunks go to a temporary folder; finished zips to `<storage_dir>/hospital/<YYYY-MM-DD>_<batch-id>.zip` with the manifest saved next to it.
- **A batches table**: id, token name, received time, file count, size, status.
- **Optional, small:** an admin-only "Hospital uploads" list (date, files, size) with a warning when nothing has arrived for more than 4 days. If cut, the same information comes from a CLI command.

## Decided in conversation (2026-11-10)

| Topic | Decision (user's) |
| --- | --- |
| What it is | A separate program at the hospital, not part of the capture app. |
| Where data comes from | The hospital's own system/PC, not our capture app. |
| How often | Every 3 days, zipped. |
| How it reaches NSU | Upload to our NSU server. |
| Patient names | No removal: their files on the PC do not contain patient names. |
| Their software | Unknown; to be found out at the visit. |

## My calls (not yet agreed; change any)

- Daily scheduled check that sends when 3 days have passed, instead of a strict every-3-days timer.
- "3 days of data" means "everything new since the last successful send", so gaps from downtime are filled.
- Language: Python 3.12, built into one `sender.exe` with PyInstaller, the same language as the server. **Revisit if the PC runs Windows 7 or older** (Python 3.9+ does not run there; would need Python 3.8 or a different tool).
- Upload in 20 MB chunks with resume, server checks SHA-256.
- Files changed after being sent (same path, new size or time) are sent again in the next batch, since a report may be corrected.
- The sender never deletes or edits hospital files; it only deletes its own zips after NSU confirms them.
- One token per PC, revocable by NSU.

## Left to the builder

- Exact table and column names; state file format (SQLite suggested).
- Log rotation and size.
- Whether the Task Scheduler entry is created by `sender.exe install` or by a short `.bat`/PowerShell script.
- Request size limits and timeouts on the server for chunk uploads.

## Open until the visit

See the checklist PDF for the full list. The ones that change the build:

1. Which PC and which folders; what file types; how many files and how many GB per day.
2. Whether files must be filtered to study patients only, and how a study patient can be recognised from a file (RC number in the name or inside the file?).
3. Windows version and whether we get admin rights on that PC.
4. Internet: upload speed, data cap, firewall/proxy, best time of day to send.
5. Whether hospital IT allows an outside program to send data out, and what they need to approve it.
6. Confirm no patient names in file contents (DICOM headers, report headers).
7. Their hospital software and PACS: names, vendors, and whether either can export to a folder by itself (which would let us skip reading it directly).

NSU must also decide where the always-on server will run before go-live.
