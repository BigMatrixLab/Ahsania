import { Camera, UserPlus } from "lucide-react";
import { Link, useParams } from "react-router";
import { usePatient } from "../api/hooks";
import type { Study } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { RecordList } from "../records/RecordList";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { card, primaryButton, secondaryButton, sectionTitle } from "../ui/styles";
import { dateLabel } from "../ui/time";
import { PairBadge } from "./PairBadge";
import { NEW_PATIENT_FORM, profileLine } from "./summary";

function sourcesOf(study: Study): string {
  if (study.image && study.report) return "image and report";
  return study.image ? "image" : "report only";
}

function StudyRow({ title, study, note }: { title: string; study: Study; note?: string }) {
  return (
    <li className="relative pb-4 pl-6 last:pb-0 before:absolute before:left-[0.3125rem] before:top-4 before:bottom-0 before:w-px before:bg-ink-200 last:before:hidden">
      <span aria-hidden="true" className="absolute left-0 top-1.5 size-3 rounded-full border-2 border-brand-600 bg-white" />
      <p className="text-sm font-medium text-ink-900">
        {title} · {dateLabel(study.date)}
      </p>
      <p className="text-xs text-ink-600">
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
    <div>
      <PageHeader
        back={{ to: "/patients", label: "All patients" }}
        title={<span className="tabular-nums">{p.reg_no}</span>}
        subtitle={p.profile ? profileLine(p.profile) : undefined}
        actions={
          me.role === "doctor" ? (
            <>
              {!hasForm && (
                <Link to={`/import-patient?patient=${encodeURIComponent(p.reg_no)}`} className={secondaryButton}>
                  <UserPlus aria-hidden="true" className="size-4" />
                  First-visit form
                </Link>
              )}
              <Link to={`/capture?patient=${encodeURIComponent(p.reg_no)}`} className={primaryButton}>
                <Camera aria-hidden="true" className="size-4" />
                New capture
              </Link>
            </>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        <section className="space-y-3 lg:col-start-1 lg:row-start-1">
          <h2 className={sectionTitle}>All records, earliest first</h2>
          <RecordList records={p.records} empty="No records." />
        </section>
        <section className={`${card} lg:col-start-2 lg:row-start-1`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionTitle}>CT/MRI and X-ray pair</h2>
            <PairBadge patient={p} />
          </div>
          {scans && (
            <ol className="mt-4">
              {p.baseline && <StudyRow title="Baseline CT/MRI" study={p.baseline} />}
              {p.xrays.map((x) => (
                <StudyRow key={x.date} title="X-ray" study={x} note={x.days_after_baseline === null ? undefined : x.days_after_baseline === 0 ? "same day as the baseline" : `${x.days_after_baseline} days after the baseline`} />
              ))}
            </ol>
          )}
          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-600">Counts approved records only, so it matches the dataset download.</p>
        </section>
      </div>
    </div>
  );
}
