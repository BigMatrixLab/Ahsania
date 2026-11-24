import type { Status } from "../api/types";

export const STATUS_LABEL: Record<Status, string> = {
  processing: "Being read",
  draft: "Draft",
  pending_admin: "Waiting for admin",
  approved: "Approved",
};

// Amber and red are kept for "check this" and "fix this", so no status uses them.
const STYLE: Record<Status, { box: string; dot: string }> = {
  processing: { box: "bg-ink-100 text-ink-700", dot: "bg-ink-500 animate-pulse motion-reduce:animate-none" },
  draft: { box: "bg-blue-50 text-blue-800", dot: "bg-blue-600" },
  pending_admin: { box: "bg-violet-50 text-violet-800", dot: "bg-violet-600" },
  approved: { box: "bg-brand-50 text-brand-800", dot: "bg-brand-600" },
};

/** `main` marks the record page's own badge (tests look it up); list badges leave it off. */
export function StatusBadge({ status, main = false }: { status: Status; main?: boolean }) {
  const { box, dot } = STYLE[status];
  return (
    <span data-testid={main ? "record-status" : undefined} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${box}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
