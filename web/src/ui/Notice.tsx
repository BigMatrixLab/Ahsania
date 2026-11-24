import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

const TONE = {
  info: { box: "border-ink-200 bg-white text-ink-800", icon: "text-ink-500", Icon: Info },
  ok: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: "text-brand-600", Icon: CheckCircle2 },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-950", icon: "text-amber-600", Icon: AlertTriangle },
  error: { box: "border-red-300 bg-red-50 text-red-900", icon: "text-red-600", Icon: AlertCircle },
};

/** A message on the page: what happened, and what to do next. */
export function Notice({ tone = "info", role, children }: { tone?: keyof typeof TONE; role?: "status" | "alert"; children: ReactNode }) {
  const { box, icon, Icon } = TONE[tone];
  return (
    <div role={role ?? (tone === "error" ? "alert" : undefined)} className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-relaxed ${box}`}>
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${icon}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
