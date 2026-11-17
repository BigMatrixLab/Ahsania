"""The real hospital system, through the contract in docs/hospital-api.md."""

from typing import Any

import httpx

from capture.hospital.client import HospitalPatient, HospitalUnavailable, NotAtHospital, UpdateResult


class HttpHospital:
    def __init__(self, url: str, token: str, timeout: float, transport: httpx.BaseTransport | None = None) -> None:
        self._http = httpx.Client(
            base_url=url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
            transport=transport,
        )

    def _call(self, method: str, path: str, **kwargs) -> Any:
        try:
            response = self._http.request(method, path, **kwargs)
        except httpx.HTTPError as e:
            raise HospitalUnavailable(str(e)) from None
        if response.status_code == 404:
            raise NotAtHospital(path)
        if response.status_code >= 400:
            raise HospitalUnavailable(f"hospital answered {response.status_code}")
        try:
            return response.json()
        except ValueError:
            raise HospitalUnavailable("hospital answered with something that is not JSON") from None

    def list_patients(self) -> list[HospitalPatient]:
        body = self._call("GET", "/patients")
        try:
            return [HospitalPatient(str(row["rc"]), row.get("updated_at")) for row in body]
        except (KeyError, TypeError, AttributeError) as e:
            raise HospitalUnavailable(f"hospital's patient list is not in the agreed shape: {e}") from None

    def get_values(self, rc: str, form: str) -> dict[str, Any]:
        body = self._call("GET", f"/patients/{rc}", params={"form": form})
        try:
            return dict(body.get("values") or {})
        except (TypeError, AttributeError, ValueError) as e:
            raise HospitalUnavailable(f"hospital's patient answer is not in the agreed shape: {e}") from None

    def update(self, rc: str, form: str, set_values: dict[str, Any], expect: dict[str, Any]) -> UpdateResult:
        body = self._call("PATCH", f"/patients/{rc}", json={"form": form, "set": set_values, "expect": expect})
        try:
            return UpdateResult(applied=list(body.get("applied", [])), conflicts=list(body.get("conflicts", [])))
        except (TypeError, AttributeError) as e:
            raise HospitalUnavailable(f"hospital's write answer is not in the agreed shape: {e}") from None
