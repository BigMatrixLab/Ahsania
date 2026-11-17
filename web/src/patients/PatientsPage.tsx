import { Download, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { usePatients } from "../api/hooks";
import { useCurrentUser } from "../auth/RequireAuth";
import { Notice } from "../ui/Notice";
import { ListSkeleton } from "../ui/Skeleton";
import { dateLabel } from "../ui/time";
import { inputClass, primaryButton, secondaryButton } from "../ui/styles";
import { PairBadge } from "./PairBadge";
import { profileLine } from "./summary";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function PatientsPage() {
  const me = useCurrentUser();
  const patients = usePatients();
  const [query, setQuery] = useState("");
  const wanted = query.replace(/\s+/g, "").toUpperCase();
  const all = patients.data ?? [];
  const found = all.filter((p) => p.reg_no.includes(wanted));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Patients</h1>
        {me.role === "admin" && all.length > 0 && (
          <a href="/api/export" download className={secondaryButton}>
            <Download aria-hidden="true" className="size-4" />
            Download dataset
          </a>
        )}
      </div>
      {patients.isPending ? (
        <ListSkeleton />
      ) : patients.isError ? (
        <Notice tone="error">{patients.error.message}</Notice>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-semibold text-slate-800">No patients yet</p>
          <p className="mt-1 text-sm text-slate-700">A patient appears here with their first form or capture.</p>
          {me.role === "doctor" && (
            <Link to="/import-patient" className={`${primaryButton} mt-3`}>
              Import patient
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul aria-label="Totals" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
            <li>
              <strong className="text-base text-slate-900 tabular-nums">{all.length}</strong> {all.length === 1 ? "patient" : "patients"}
            </li>
            <li>
              <strong className="text-base text-teal-800 tabular-nums">{all.filter((p) => p.paired).length}</strong> paired
            </li>
            <li>
              <strong className="text-base text-slate-900 tabular-nums">{all.reduce((sum, p) => sum + p.approved_count, 0)}</strong> approved records
            </li>
          </ul>
          <label className="block max-w-sm">
            <span className="sr-only">Find a patient</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find by patient ID" autoComplete="off" className={`${inputClass} mt-0 pl-9`} />
            </span>
          </label>
          {found.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-700">No patient with that ID.</p>
          ) : (
            <ul className="space-y-2">
              {found.map((p) => (
                <li key={p.reg_no}>
                  <Link to={`/patients/${encodeURIComponent(p.reg_no)}`} className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-50">
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold tabular-nums text-slate-900">{p.reg_no}</span>
                      <PairBadge patient={p} />
                    </span>
                    {p.profile && <span className="mt-1 block text-sm text-slate-800">{profileLine(p.profile)}</span>}
                    <span className="mt-1 block text-xs text-slate-600">
                      {plural(p.record_count, "record")}, {p.approved_count} approved
                      {p.baseline ? ` · CT/MRI ${dateLabel(p.baseline.date)}` : ""}
                      {p.xrays.length > 0 ? ` · ${plural(p.xrays.length, "X-ray")}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
