import { ChevronRight, Download, Search, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { usePatients } from "../api/hooks";
import { useCurrentUser } from "../auth/RequireAuth";
import { EmptyState } from "../ui/EmptyState";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { dateLabel } from "../ui/time";
import { inputClass, listSurface, primaryButton, secondaryButton } from "../ui/styles";
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
    <section>
      <PageHeader
        title="Patients"
        subtitle="Each patient needs an approved CT/MRI and a follow-up X-ray to make a pair for the study."
        actions={
          me.role === "admin" && all.length > 0 ? (
            <a href="/api/export" download className={secondaryButton}>
              <Download aria-hidden="true" className="size-4" />
              Download dataset
            </a>
          ) : undefined
        }
      />
      {patients.isPending ? (
        <ListSkeleton />
      ) : patients.isError ? (
        <Notice tone="error">{patients.error.message}</Notice>
      ) : all.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patients yet"
          action={
            me.role === "doctor" ? (
              <Link to="/import-patient" className={primaryButton}>
                <UserPlus aria-hidden="true" className="size-4" />
                Import patient
              </Link>
            ) : undefined
          }
        >
          A patient appears here with their first form or capture.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <ul aria-label="Totals" className="grid grid-cols-3 divide-x divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-white text-sm text-ink-700">
            <li className="px-4 py-3">
              <strong className="block text-2xl font-semibold leading-tight tabular-nums text-ink-900">{all.length}</strong> {all.length === 1 ? "patient" : "patients"}
            </li>
            <li className="px-4 py-3">
              <strong className="block text-2xl font-semibold leading-tight tabular-nums text-brand-700">{all.filter((p) => p.paired).length}</strong> paired
            </li>
            <li className="px-4 py-3">
              <strong className="block text-2xl font-semibold leading-tight tabular-nums text-ink-900">{all.reduce((sum, p) => sum + p.approved_count, 0)}</strong> approved records
            </li>
          </ul>
          <label className="block max-w-sm">
            <span className="sr-only">Find a patient</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find by patient ID" autoComplete="off" className={`${inputClass} mt-0 pl-9`} />
            </span>
          </label>
          {found.length === 0 ? (
            <EmptyState>No patient with that ID.</EmptyState>
          ) : (
            <ul className={listSurface}>
              {found.map((p) => (
                <li key={p.reg_no}>
                  <Link to={`/patients/${encodeURIComponent(p.reg_no)}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 active:bg-ink-100">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="text-base font-semibold tabular-nums text-ink-900">{p.reg_no}</span>
                        <PairBadge patient={p} />
                      </span>
                      {p.profile && <span className="mt-1 block text-sm text-ink-800">{profileLine(p.profile)}</span>}
                      <span className="mt-1 block text-xs text-ink-600">
                        {plural(p.record_count, "record")}, {p.approved_count} approved
                        {p.baseline ? ` · CT/MRI ${dateLabel(p.baseline.date)}` : ""}
                        {p.xrays.length > 0 ? ` · ${plural(p.xrays.length, "X-ray")}` : ""}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="hidden size-5 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5 sm:block" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
