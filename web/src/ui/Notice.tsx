import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

const TONE = {
  info: { box: "bg-slate-100 text-slate-800", Icon: Info },
  ok: { box: "bg-teal-50 text-teal-900", Icon: CheckCircle2 },
  warn: { box: "bg-amber-50 text-amber-900", Icon: AlertTriangle },
  error: { box: "bg-red-50 text-red-800", Icon: AlertCircle },
};

/** A message on the page: what happened, and what to do next. */
export function Notice({ tone = "info", role, children }: { tone?: keyof typeof TONE; role?: "status" | "alert"; children: ReactNode }) {
  const { box, Icon } = TONE[tone];
  return (
    <div role={role ?? (tone === "error" ? "alert" : undefined)} className={`flex gap-2 rounded-xl p-3 text-sm ${box}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
