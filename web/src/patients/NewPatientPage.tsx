import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, api } from "../api/client";
import type { RecordDetail } from "../api/types";
import { normalizeRegNo } from "../capture/PatientStep";
import { newId } from "../storage/id";
import { Notice } from "../ui/Notice";
import { inputClass, primaryButton } from "../ui/styles";
import { NEW_PATIENT_FORM } from "./summary";

export default function NewPatientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [regNo, setRegNo] = useState(params.get("patient") ?? "");
  const [problem, setProblem] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent) {
    event.preventDefault();
    const value = normalizeRegNo(regNo);
    if (!value) {
      setProblem("Patient ID must be RC followed by numbers");
      return;
    }
    setBusy(true);
    setProblem(null);
    const form = new FormData();
    form.append("meta", JSON.stringify({ reg_no: value, template_key: NEW_PATIENT_FORM, client_upload_id: newId() }));
    try {
      const record = await api<RecordDetail>("/records", { method: "POST", body: form });
      void queryClient.invalidateQueries({ queryKey: ["records"] });
      navigate(`/records/${record.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setProblem(
          <>
            {value} already has a first-visit form.{" "}
            <Link to={`/patients/${value}`} className="font-medium underline">
              Open {value}
            </Link>
          </>,
        );
      } else {
        setProblem(e instanceof ApiError ? e.message : "Could not reach the server. Check the connection and try again.");
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={start} className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-800">New patient</h1>
      <p className="text-sm text-slate-700">The first-visit form opens next. It takes the history, exposures, examination, stage and plan. No names or phone numbers.</p>
      <label className="block">
        <span className="text-sm font-medium">Patient ID (RC…)</span>
        <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="RC12345" autoComplete="off" autoCapitalize="characters" required className={inputClass} />
      </label>
      {problem && <Notice tone="error">{problem}</Notice>}
      <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
        {busy ? "Starting…" : "Start first-visit form"}
      </button>
    </form>
  );
}
