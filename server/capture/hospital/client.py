"""The hospital system, seen through one small interface (design: "Hospital API contract").

`stub` is a made-up hospital kept in a JSON file, for building and demos. `http` talks to the real one once
hospital IT builds docs/hospital-api.md. Values use our variable keys; no names or contact details ever.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol

from capture.config import Settings


class HospitalUnavailable(Exception):
    """The hospital system cannot be reached, timed out, or failed."""


class NotAtHospital(Exception):
    """The hospital does not know this RC number."""


@dataclass(frozen=True)
class HospitalPatient:
    rc: str
    updated_at: str | None = None


@dataclass(frozen=True)
class UpdateResult:
    applied: list[str] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)  # each {"key": ..., "hospital_value": ...}


class Hospital(Protocol):
    def list_patients(self) -> list[HospitalPatient]: ...

    def get_values(self, rc: str, form: str) -> dict[str, Any]: ...

    def update(self, rc: str, form: str, set_values: dict[str, Any], expect: dict[str, Any]) -> UpdateResult:
        """Write `set_values`; a key whose current value differs from `expect` (absent = None) is a conflict."""
        ...


def make_hospital(settings: Settings) -> Hospital:
    if settings.hospital == "stub":
        from capture.hospital.stub import StubHospital

        return StubHospital(settings.hospital_stub_file or settings.storage_dir / "hospital-stub.json")
    if settings.hospital == "http":
        from capture.hospital.http import HttpHospital

        return HttpHospital(settings.hospital_url, settings.hospital_token, settings.hospital_timeout_s)
    raise ValueError(f"CAPTURE_HOSPITAL must be 'stub' or 'http', not {settings.hospital!r}")


DOWN_MESSAGE = "Hospital system not reachable. Type the RC number and fill the form by hand."
UNKNOWN_MESSAGE = "This RC number is not in the hospital system."
