import { AlertTriangle, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { RecordSummary } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";
import { listSurface } from "../ui/styles";
import { ageLabel, dateLabel } from "../ui/time";
import { DeleteButton } from "./DeleteButton";
import { canDelete } from "./permissions";

/** The row's left rail: red/amber when something needs a look, otherwise the status colour. */
function rail(r: RecordSummary): string {
  if (r.ai_red > 0) return "bg-red-500";
  if (r.ai_amber > 0 || (r.status === "draft" && r.sent_to_admin)) return "bg-amber-400";
  if (r.status === "approved") return "bg-brand-500";
  if (r.status === "pending_admin") return "bg-violet-500";
  if (r.status === "processing") return "bg-ink-300";
  return "bg-blue-500";
}

export function RecordList({ records, empty }: { records: RecordSummary[]; empty: ReactNode }) {
  const me = useCurrentUser();
  if (records.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className={listSurface}>
      {records.map((r) => (
        <li key={r.id}>
          <Link to={`/records/${r.id}`} className="group flex items-stretch gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 active:bg-ink-100">
            <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${rail(r)}`} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-base font-semibold tabular-nums text-ink-900">{r.reg_no}</span>
                <StatusBadge status={r.status} />
                <span className="ml-auto shrink-0 text-xs text-ink-600">{ageLabel(r.updated_at)}</span>
              </span>
              <span className="mt-1 block text-sm text-ink-800">{r.template_title}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-600">
                <span>
                  {r.created_by_name}
                  {r.document_date ? ` · ${dateLabel(r.document_date)}` : ""}
                </span>
                {r.status === "draft" && r.sent_to_admin && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Sent back</span>}
                {r.ai_amber > 0 && <Flag tone="bg-amber-100 text-amber-900">{r.ai_amber} to check</Flag>}
                {r.ai_red > 0 && <Flag tone="bg-red-100 text-red-800">{r.ai_red} to fix</Flag>}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="hidden size-5 shrink-0 self-center text-ink-400 transition-transform group-hover:translate-x-0.5 sm:block" />
          </Link>
          {canDelete(me, r) && (
            <div className="-mt-1.5 flex justify-end px-3 pb-1.5">
              <DeleteButton recordId={r.id} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Flag({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${tone}`}>
      <AlertTriangle aria-hidden="true" className="size-3" />
      {children}
    </span>
  );
}
