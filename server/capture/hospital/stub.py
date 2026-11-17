"""A stand-in hospital with 30 made-up patients, kept in one JSON file so writes survive restarts.

Each patient has about half of the Import patient answers, so a doctor sees both filled and empty fields;
about a third also have treatment and follow-up answers. RC500030 carries a made-up `patient_name`, so the
app's dropping of keys it does not know can be seen by hand.
"""

import json
import random
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from capture.hospital.client import HospitalPatient, NotAtHospital, UpdateResult

TEMPLATES_DIR = Path(__file__).resolve().parents[3] / "templates"
FORMS = ("import_patient", "treatment", "toxicity_outcome")
_lock = threading.Lock()


def _made_up(field: dict, rng: random.Random) -> Any:
    kind = field["type"]
    if kind == "boolean":
        return rng.random() < 0.4
    if kind == "enum":
        return rng.choice(field["options"])
    if kind == "number":
        low, high = field.get("min", 0), field.get("max", 100)
        high = min(high, low + 60)
        return round(rng.uniform(low, high), 1) if isinstance(low, float) else rng.randint(int(low), int(high))
    if kind == "date":
        return (date(2026, 1, 1) + timedelta(days=rng.randint(0, 300))).isoformat()
    return None  # free text stays empty: nothing made up should look like a real note


def _form_values(form: str, rng: random.Random, share: float) -> dict[str, Any]:
    definition = yaml.safe_load((TEMPLATES_DIR / f"{form}.yaml").read_text(encoding="utf-8"))
    values: dict[str, Any] = {}
    for f in definition["fields"]:
        if f.get("document_date") or f.get("required") or rng.random() < share:
            value = _made_up(f, rng)
            if value is not None:
                values[f["key"]] = value
    return values


def seed_patients(rng: random.Random) -> dict:
    patients = {}
    for n in range(1, 31):
        rc = f"RC5000{n:02d}"
        forms = {"import_patient": _form_values("import_patient", rng, 0.5)}
        if n % 3 == 0:
            forms["treatment"] = _form_values("treatment", rng, 0.5)
            forms["toxicity_outcome"] = _form_values("toxicity_outcome", rng, 0.5)
        if n == 30:
            forms["import_patient"]["patient_name"] = "Test"
        updated = (date(2026, 11, 1) - timedelta(days=n)).isoformat()
        patients[rc] = {"updated_at": updated, "forms": forms}
    return {"patients": patients}


class StubHospital:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def _read(self) -> dict:
        if not self.path.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._write(seed_patients(random.Random(42)))
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, data: dict) -> None:
        self.path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")

    def list_patients(self) -> list[HospitalPatient]:
        with _lock:
            data = self._read()
        rows = [HospitalPatient(rc, p.get("updated_at")) for rc, p in data["patients"].items()]
        return sorted(rows, key=lambda p: p.updated_at or "", reverse=True)

    def get_values(self, rc: str, form: str) -> dict[str, Any]:
        with _lock:
            patient = self._read()["patients"].get(rc)
        if patient is None:
            raise NotAtHospital(rc)
        return dict(patient["forms"].get(form, {}))

    def update(self, rc: str, form: str, set_values: dict[str, Any], expect: dict[str, Any]) -> UpdateResult:
        with _lock:
            data = self._read()
            patient = data["patients"].get(rc)
            if patient is None:
                raise NotAtHospital(rc)
            current = patient["forms"].setdefault(form, {})
            applied, conflicts = [], []
            for key, value in set_values.items():
                if current.get(key) != expect.get(key):
                    conflicts.append({"key": key, "hospital_value": current.get(key)})
                else:
                    current[key] = value
                    applied.append(key)
            if applied:
                patient["updated_at"] = date.today().isoformat()
                self._write(data)
        return UpdateResult(applied=applied, conflicts=conflicts)
