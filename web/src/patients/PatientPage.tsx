import { FileUp, UserPlus } from "lucide-react";
import { Link, useParams } from "react-router";
import { usePatient } from "../api/hooks";
import type { Study } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { RecordList } from "../records/RecordList";
import { Notice } from "../ui/Notice";
import { ListSkeleton } from "../ui/Skeleton";
import { card, secondaryButton } from "../ui/styles";
import { dateLabel } from "../ui/time";
import { PairBadge } from "./PairBadge";
import { NEW_PATIENT_FORM, profileLine } from "./summary";

function sourcesOf(study: Study): string {
  if (study.image && study.report) return "image and report";
  return study.image ? "image" : "report only";
}

function StudyRow({ title, study, note }: { title: string; study: Study; note?: string }) {
  return (
    <li className="relative pl-5 before:absolute before:left-0 before:top-1.5 before:size-2.5 before:rounded-full before:bg-teal-600">
      <p className="text-sm font-medium text-slate-900">
        {title} · {dateLabel(study.date)}
      </p>
      <p className="text-xs text-slate-600">
        {sourcesOf(study)}
        {note ? ` · ${note}` : ""}
      </p>
    </li>
  );
}

export default function PatientPage() {
  const { regNo = "" } = useParams();
  const me = useCurrentUser();
  const patient = usePatient(regNo);
  if (patient.isPending) return <ListSkeleton />;
  if (patient.isError) return <Notice tone="error">{patient.error.message}</Notice>;
  const p = patient.data;
  const hasForm = p.records.some((r) => r.template_key === NEW_PATIENT_FORM);
  const scans = p.baseline !== null || p.xrays.length > 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold tabular-nums text-slate-800">{p.reg_no}</h1>
        {p.profile && <p className="mt-0.5 text-slate-800">{profileLine(p.profile)}</p>}
      </header>
      {me.role === "doctor" && (
        <div className="flex flex-wrap gap-2">
          {!hasForm && (
            <Link to={`/import-patient?patient=${encodeURIComponent(p.reg_no)}`} className={secondaryButton}>
              <UserPlus aria-hidden="true" className="size-4" />
              First-visit form
            </Link>
          )}
          <Link to={`/capture?patient=${encodeURIComponent(p.reg_no)}`} className={secondaryButton}>
            <FileUp aria-hidden="true" className="size-4" />
            New capture
          </Link>
        </div>
      )}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">CT/MRI and X-ray pair</h2>
          <PairBadge patient={p} />
        </div>
        {scans && (
          <ol className="mt-3 space-y-2.5">
            {p.baseline && <StudyRow title="Baseline CT/MRI" study={p.baseline} />}
            {p.xrays.map((x) => (
              <StudyRow key={x.date} title="X-ray" study={x} note={x.days_after_baseline === null ? undefined : x.days_after_baseline === 0 ? "same day as the baseline" : `${x.days_after_baseline} days after the baseline`} />
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-slate-600">Counts approved records only, so it matches the dataset download.</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-slate-800">All records, earliest first</h2>
        <RecordList records={p.records} empty="No records." />
      </section>
    </div>
  );
}
