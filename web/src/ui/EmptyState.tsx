import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** An empty list is an invitation: say what belongs here and, if there is one, offer the next step. */
export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-300 bg-white/60 px-6 py-8 text-center">
      {Icon && (
        <span aria-hidden="true" className="mb-3 grid size-11 place-items-center rounded-full bg-ink-100 text-ink-600">
          <Icon className="size-5" />
        </span>
      )}
      {title && <p className="font-semibold text-ink-900">{title}</p>}
      {children && <div className={`text-sm text-ink-700 ${title ? "mt-1" : ""}`}>{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
