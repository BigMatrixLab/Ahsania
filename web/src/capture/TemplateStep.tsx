import { ChevronRight, FileText, Image as ImageIcon, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useTemplates } from "../api/hooks";
import type { TemplateOut } from "../api/types";
import { Notice } from "../ui/Notice";
import { ListSkeleton } from "../ui/Skeleton";
import { quietButton } from "../ui/styles";

interface Props {
  onDone: (template: TemplateOut) => void;
  onBack: () => void;
}

export function TemplateStep({ onDone, onBack }: Props) {
  const templates = useTemplates();
  if (templates.isPending) return <ListSkeleton />;
  if (templates.isError) return <Notice tone="error">{templates.error.message}</Notice>;
  const photographable = templates.data.filter((t) => (t.kind === "document" || t.kind === "film_photo") && !t.definition.retired);
  const open = photographable.filter((t) => !t.locked);
  const documents = open.filter((t) => t.kind === "document");
  const films = open.filter((t) => t.kind === "film_photo");
  const locked = photographable.filter((t) => t.locked);

  const group = (title: string, items: TemplateOut[], Icon: typeof FileText): ReactNode =>
    items.length > 0 && (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ink-700">{title}</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => onDone(t)}
                className="group flex min-h-16 w-full items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 text-left transition-colors hover:border-brand-500 hover:bg-brand-50/50 active:bg-brand-50"
              >
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon className="size-5" />
                </span>
                <span className="flex-1 font-medium text-ink-900">{t.title}</span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-ink-900">What are you photographing?</h2>
      {group("Reports and documents", documents, FileText)}
      {group("Film photos", films, ImageIcon)}
      {locked.length > 0 && (
        <details className="rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
          <summary className="flex min-h-8 cursor-pointer items-center gap-2 font-medium">
            <Lock aria-hidden="true" className="size-4 text-ink-500" />
            {locked.length} more forms are not available yet
          </summary>
          <ul className="mt-2 space-y-1">
            {locked.map((t) => (
              <li key={t.key}>
                <button type="button" disabled className="min-h-8 cursor-not-allowed text-left text-ink-600">
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" onClick={onBack} className={quietButton}>
        Back
      </button>
    </div>
  );
}
