import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, api } from "../api/client";
import { useHospitalPatients, useTemplates } from "../api/hooks";
import type { RecordDetail, TemplateOut } from "../api/types";
import { normalizeRegNo } from "../capture/PatientStep";
import { newId } from "../storage/id";
import { Notice } from "../ui/Notice";
import { card, inputClass, primaryButton, quietButton } from "../ui/styles";
import { NEW_PATIENT_FORM } from "./summary";

const ORDER = [NEW_PATIENT_FORM, "treatment", "toxicity_outcome"];
const MAX_SHOWN = 50;

function hospitalForms(templates: TemplateOut[]): TemplateOut[] {
  const rank = (t: TemplateOut) => (ORDER.includes(t.key) ? ORDER.indexOf(t.key) : ORDER.length);
  return templates
    .filter((t) => t.definition.hospital && !t.definition.retired && !t.locked)
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

/** Pick a patient from the hospital system and open a form filled with what the hospital holds; or type the RC by hand. */
export default function ImportPatientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const templates = useTemplates();
  const forms = useMemo(() => hospitalForms(templates.data ?? []), [templates.data]);
  const [chosen, setChosen] = useState(params.get("form") ?? NEW_PATIENT_FORM);
  const form = forms.find((t) => t.key === chosen) ?? forms[0];
  const formKey = form?.key ?? chosen;
  const patients = useHospitalPatients(formKey);
  const [search, setSearch] = useState(params.get("patient") ?? "");
  const [manualOpen, setManualOpen] = useState(false);
  const [regNo, setRegNo] = useState(params.get("patient") ?? "");
  const [problem, setProblem] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const hospitalDown = patients.isError;
  const manual = manualOpen || hospitalDown;
  const query = search.replace(/\s+/g, "").toUpperCase();
  const matches = (patients.data ?? []).filter((p) => p.rc.includes(query));

  async function create(rc: string, fromHospital: boolean) {
    setBusy(true);
    setProblem(null);
    const body = new FormData();
    body.append("meta", JSON.stringify({ reg_no: rc, template_key: formKey, client_upload_id: newId(), from_hospital: fromHospital }));
    try {
      const record = await api<RecordDetail>("/records", { method: "POST", body });
      void queryClient.invalidateQueries({ queryKey: ["records"] });
      void queryClient.invalidateQueries({ queryKey: ["hospital-patients"] });
      navigate(`/records/${record.id}`, { replace: true });
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.status === 409) {
        setProblem(
          <>
            {rc} already has this form.{" "}
            <Link to={`/patients/${rc}`} className="font-medium underline">
              Open {rc}
            </Link>
          </>,
        );
      } else if (e instanceof ApiError && (e.status === 404 || e.status === 503)) {
        setProblem(e.message);
        setRegNo(rc);
        setManualOpen(true);
      } else {
        setProblem(e instanceof ApiError ? e.message : "Could not reach the server. Check the connection and try again.");
      }
    }
  }

  function startManual(event: FormEvent) {
    event.preventDefault();
    const value = normalizeRegNo(regNo);
    if (!value) {
      setProblem("Patient ID must be RC followed by numbers");
      return;
    }
    void create(value, false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Import patient</h1>
        <p className="text-sm text-slate-700">Pick the patient from the hospital system. What the hospital has fills in; you type the rest. No names or phone numbers.</p>
      </div>

      {forms.length > 1 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-medium">Form</legend>
          {forms.map((t) => (
            <label key={t.key} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${t.key === formKey ? "border-teal-700 bg-teal-50 font-medium text-teal-900" : "border-slate-300 bg-white"}`}>
              <input type="radio" name="form" value={t.key} checked={t.key === formKey} onChange={() => setChosen(t.key)} className="sr-only" />
              {t.title}
            </label>
          ))}
        </fieldset>
      )}

      {problem && <Notice tone="error">{problem}</Notice>}
      {hospitalDown && !problem && <Notice tone="error">{patients.error.message}</Notice>}

      {!hospitalDown && (
        <section className={`${card} space-y-3`}>
          <label className="block">
            <span className="text-sm font-medium">Search RC number</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="RC500…" autoComplete="off" autoCapitalize="characters" className={inputClass} />
          </label>
          {patients.isPending && <p className="text-sm text-slate-600">Loading the hospital's patients…</p>}
          {patients.data && matches.length === 0 && <p className="text-sm text-slate-600">No RC number matches.</p>}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {matches.slice(0, MAX_SHOWN).map((p) => (
              <li key={p.rc}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void create(p.rc, true)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-sm hover:bg-teal-50 focus:bg-teal-50 disabled:opacity-60"
                >
                  {p.rc}
                  {p.imported && (
                    <span className="flex items-center gap-1 font-sans text-xs text-teal-800">
                      <Check aria-hidden="true" className="size-3.5" /> imported
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {matches.length > MAX_SHOWN && <p className="text-xs text-slate-600">Showing {MAX_SHOWN} of {matches.length}. Type more of the number to narrow it.</p>}
          {!manual && (
            <button type="button" onClick={() => setManualOpen(true)} className={quietButton}>
              Not in the list? Type the RC number
            </button>
          )}
        </section>
      )}

      {manual && (
        <form onSubmit={startManual} className={`${card} space-y-3`}>
          <label className="block">
            <span className="text-sm font-medium">Patient ID (RC…)</span>
            <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="RC12345" autoComplete="off" autoCapitalize="characters" className={inputClass} />
          </label>
          <p className="text-xs text-slate-600">The form opens empty; fill it in by hand.</p>
          <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
            {busy ? "Starting…" : "Start form"}
          </button>
        </form>
      )}
    </div>
  );
}
