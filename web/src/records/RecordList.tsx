import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { RecordSummary } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { StatusBadge } from "../ui/StatusBadge";
import { ageLabel, dateLabel } from "../ui/time";
import { DeleteButton } from "./DeleteButton";
import { canDelete } from "./permissions";

/** The card's left edge: red/amber when something needs a look, otherwise the status colour. */
function edge(r: RecordSummary): string {
  if (r.ai_red > 0) return "border-l-red-500";
  if (r.ai_amber > 0 || (r.status === "draft" && r.sent_to_admin)) return "border-l-amber-400";
  if (r.status === "approved") return "border-l-green-600";
  if (r.status === "pending_admin") return "border-l-cyan-500";
  if (r.status === "processing") return "border-l-slate-300";
  return "border-l-teal-600";
}

export function RecordList({ records, empty }: { records: RecordSummary[]; empty: ReactNode }) {
  const me = useCurrentUser();
  if (records.length === 0) return <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">{empty}</div>;
  return (
    <ul className="space-y-2">
      {records.map((r) => (
        <li key={r.id} className={`relative rounded-2xl border border-l-4 border-slate-200 bg-white shadow-sm ${edge(r)}`}>
          <Link to={`/records/${r.id}`} className="block rounded-2xl p-3 transition-colors hover:bg-slate-50">
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums text-slate-900">{r.reg_no}</span>
              <StatusBadge status={r.status} />
              <span className="ml-auto shrink-0 text-xs text-slate-600">{ageLabel(r.updated_at)}</span>
            </span>
            <span className="mt-1 block text-sm text-slate-800">{r.template_title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span>
                {r.created_by_name}
                {r.document_date ? ` · ${dateLabel(r.document_date)}` : ""}
              </span>
              {r.status === "draft" && r.sent_to_admin && <span className="rounded-full bg-amber-100 px-2 font-semibold text-amber-900">Sent back</span>}
              {r.ai_amber > 0 && <Flag tone="bg-amber-100 text-amber-900">{r.ai_amber} to check</Flag>}
              {r.ai_red > 0 && <Flag tone="bg-red-100 text-red-800">{r.ai_red} to fix</Flag>}
            </span>
          </Link>
          {canDelete(me, r) && (
            <div className="absolute bottom-0 right-1 max-w-[calc(100%-0.5rem)] rounded-xl bg-white">
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 font-semibold ${tone}`}>
      <AlertTriangle aria-hidden="true" className="size-3" />
      {children}
    </span>
  );
}
