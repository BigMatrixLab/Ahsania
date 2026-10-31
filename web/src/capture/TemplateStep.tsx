import { ChevronRight, FileText, Image as ImageIcon, Lock } from "lucide-react";
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
  const photographable = templates.data.filter((t) => t.kind === "document" || t.kind === "film_photo");
  const open = photographable.filter((t) => !t.locked).sort((a, b) => Number(b.kind === "document") - Number(a.kind === "document"));
  const locked = photographable.filter((t) => t.locked);
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-800">What are you photographing?</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {open.map((t) => {
          const Icon = t.kind === "document" ? FileText : ImageIcon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onDone(t)}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-teal-500 hover:bg-teal-50"
            >
              <Icon aria-hidden="true" className="size-6 shrink-0 text-teal-700" />
              <span className="flex-1 font-medium text-slate-900">{t.title}</span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-slate-400" />
            </button>
          );
        })}
      </div>
      {locked.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <summary className="flex min-h-8 cursor-pointer items-center gap-2 font-medium">
            <Lock aria-hidden="true" className="size-4 text-slate-500" />
            {locked.length} more forms open in Phase 3
          </summary>
          <ul className="mt-2 space-y-1">
            {locked.map((t) => (
              <li key={t.key}>
                <button type="button" disabled className="min-h-8 cursor-not-allowed text-left text-slate-600">
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
