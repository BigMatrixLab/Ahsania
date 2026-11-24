import { useQueryClient } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, api } from "../api/client";
import { useHospitalPatients, useTemplates } from "../api/hooks";
import type { RecordDetail, TemplateOut } from "../api/types";
import { normalizeRegNo } from "../capture/PatientStep";
import { newId } from "../storage/id";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
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
      <PageHeader back={{ to: "/", label: "Back" }} title="Import patient" subtitle="Pick the patient from the hospital system. What the hospital has fills in; you type the rest. No names or phone numbers." />

      {forms.length > 1 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium text-ink-800">Form</legend>
          {forms.map((t) => (
            <label key={t.key} className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${t.key === formKey ? "border-brand-700 bg-brand-700 font-medium text-white" : "border-ink-300 bg-white text-ink-800 hover:bg-ink-50"}`}>
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
            <span className="text-sm font-medium text-ink-800">Search RC number</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="RC500…" autoComplete="off" autoCapitalize="characters" className={`${inputClass} pl-9`} />
            </span>
          </label>
          {patients.isPending && <p className="text-sm text-ink-600">Loading the hospital's patients…</p>}
          {patients.data && matches.length === 0 && <p className="text-sm text-ink-600">No RC number matches.</p>}
          <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-200">
            {matches.slice(0, MAX_SHOWN).map((p) => (
              <li key={p.rc}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void create(p.rc, true)}
                  className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm font-medium tabular-nums transition-colors hover:bg-brand-50 focus:bg-brand-50 disabled:opacity-60"
                >
                  {p.rc}
                  {p.imported && (
                    <span className="flex items-center gap-1 text-xs font-medium text-brand-800">
                      <Check aria-hidden="true" className="size-3.5" /> imported
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {matches.length > MAX_SHOWN && <p className="text-xs text-ink-600">Showing {MAX_SHOWN} of {matches.length}. Type more of the number to narrow it.</p>}
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
            <span className="text-sm font-medium text-ink-800">Patient ID (RC…)</span>
            <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="RC12345" autoComplete="off" autoCapitalize="characters" className={inputClass} />
          </label>
          <p className="text-xs text-ink-600">The form opens empty; fill it in by hand.</p>
          <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
            {busy ? "Starting…" : "Start form"}
          </button>
        </form>
      )}
    </div>
  );
}
