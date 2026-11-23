import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { pageTitle } from "./styles";

/** Title, one line of context and the page's main actions. `back` adds a way out for pages reached from a list. */
export function PageHeader({ title, subtitle, actions, back, titleAddon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; titleAddon?: ReactNode }) {
  return (
    <header className="mb-5 md:mb-6">
      {back && (
        <Link to={back.to} className="-ml-2 mb-1 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className={pageTitle}>{title}</h1>
            {titleAddon}
          </div>
          {subtitle && <p className="mt-1 max-w-prose text-sm text-ink-700">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
