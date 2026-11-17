# Hospital API for the AMCGH × NSU research app

**For:** AMCGH hospital IT
**From:** the NSU Big-Matrix Lab research team

## What this is for

Doctors use our app to collect the lung cancer study variables. Much of that data is already in the hospital software. We ask for an API with three calls, so that:

1. a doctor picks a patient's RC number and the app fills in what the hospital already has;
2. what the doctor adds, and any corrections a doctor and an admin have both approved, are written back to the hospital software.

Nothing is written to the hospital until an admin approves the record. Admins are hospital IT staff and the NSU team.

**Never send** patient name, address, phone number, national ID or date of birth, in any call. The RC number is the only identifier.

## The variables

Our variable names are the field `key`s in three files in this repository:

| Form | File | What it holds |
| --- | --- | --- |
| `import_patient` | `templates/import_patient.yaml` | First visit: background, smoking, exposures, history, symptoms, examination, tumour, stage, molecular markers, plan |
| `treatment` | `templates/treatment.yaml` | One treatment update: surgery, chemotherapy, radiotherapy, immunotherapy, targeted therapy |
| `toxicity_outcome` | `templates/toxicity_outcome.yaml` | One follow-up: toxicity, response, progression, vital status |

Please use these keys as your field names. Where the hospital software lacks a variable, please add it. Each file lists the allowed options for every variable.

**Value formats**
- Dates: `YYYY-MM-DD`.
- Yes/no: `true` / `false`.
- Choices: exactly one of the listed option strings, e.g. `"adenocarcinoma"`.
- Numbers: plain numbers, e.g. `56` or `3.2`.
- A variable the hospital does not have: leave it out, or send `null`.

## Security

- HTTPS only.
- Every request carries `Authorization: Bearer <token>`. You give us a token; we keep it on our server only.
- Please tell us the address and the token, and whether our server's address must be allowed through your firewall.

## The three calls

### 1. List patients

```http
GET /patients
```

```json
[
  {"rc": "RC12345", "updated_at": "2026-11-15"},
  {"rc": "RC12346", "updated_at": "2026-11-14"}
]
```

These are the lung cancer patients the study may include, newest first. `updated_at` is optional.

### 2. One patient's values for one form

```http
GET /patients/RC12345?form=import_patient
```

```json
{
  "rc": "RC12345",
  "values": {"age_years": 56, "sex": "male", "smoking_status": "current", "histology": "adenocarcinoma"},
  "updated_at": "2026-11-15"
}
```

- Unknown RC number: answer `404`.
- For `treatment` and `toxicity_outcome`, send the latest visit. **Question for you:** how should we ask for an earlier visit?

### 3. Write values back

```http
PATCH /patients/RC12345
Content-Type: application/json

{
  "form": "import_patient",
  "set":    {"education": "primary", "age_years": 58},
  "expect": {"age_years": 56}
}
```

- `set` holds the values to write.
- `expect` holds what we last saw in the hospital for a value we are **changing**. A variable that was empty at the hospital has no `expect` entry.
- If the hospital's current value is not the `expect` value, someone changed it in the meantime. **Do not write that one**; report it as a conflict. Write the rest.

```json
{
  "applied": ["education"],
  "conflicts": [{"key": "age_years", "hospital_value": 57}]
}
```

An admin then decides which value is right, in our app.

## Errors

| Answer | Meaning to us |
| --- | --- |
| `200` | Done |
| `404` | Unknown RC number |
| `401` / `403` | Wrong token |
| `5xx`, timeout | Hospital system unavailable; the doctor can type the form by hand, and the admin retries later |

## Questions for hospital IT

1. Can you build these three calls, or do you already have an API we should use instead?
2. How do treatment and follow-up visits map to your records: one entry per visit, or only the latest?
3. Which of our variables will you add, and when?
4. Does writing back need approval from hospital management or the ethics committee?
5. The server address and token, and the firewall rule.
