import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import type { FileOut, SourceBox } from "../api/types";
import { card, secondaryButton } from "../ui/styles";

/** The record's photos. `marks` outline where the tapped field's value was read. */
export function PageViewer({ files, marks = [] }: { files: FileOut[]; marks?: SourceBox[] }) {
  const pages = files.filter((f) => f.kind === "page");
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState<{ id: string; w: number; h: number } | null>(null);
  const marksKey = marks.map((m) => `${m.page}:${m.box.join(",")}`).join("|");

  // Show the page of the first mark whenever the marks change (e.g. another field was tapped).
  useEffect(() => {
    if (marks.length > 0) setIndex(marks[0].page - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  if (pages.length === 0) return <p className={card}>No images.</p>;
  const current = Math.min(Math.max(index, 0), pages.length - 1);
  const file = pages[current];
  const natural = size?.id === file.id ? size : null;
  const shown = natural ? marks.filter((m) => m.page === current + 1) : [];
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  return (
    <details open className={`${card} group space-y-3 self-start lg:sticky lg:top-20`}>
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm text-ink-700 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">
          <span className="font-semibold text-ink-900">
            Page {current + 1} of {pages.length}
          </span>
          <span className="hidden sm:inline"> · pinch or scroll to zoom</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-5 text-ink-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <TransformWrapper key={file.id}>
        <TransformComponent wrapperClass="!w-full" contentClass="!w-full">
          <div className="relative w-full">
            <img
              src={`/api/files/${file.id}`}
              alt={`Page ${current + 1}`}
              className="w-full rounded-lg border border-ink-200"
              onLoad={(e) => setSize({ id: file.id, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
            {natural &&
              shown.map((m, i) => (
                <div
                  key={i}
                  data-testid="source-box"
                  className="pointer-events-none absolute rounded-sm border-2 border-brand-600 bg-brand-500/15 ring-2 ring-white/70"
                  style={{
                    left: pct(m.box[0], natural.w),
                    top: pct(m.box[1], natural.h),
                    width: pct(m.box[2] - m.box[0], natural.w),
                    height: pct(m.box[3] - m.box[1], natural.h),
                  }}
                />
              ))}
          </div>
        </TransformComponent>
      </TransformWrapper>
      {pages.length > 1 && (
        <div className="flex gap-2">
          <button type="button" disabled={current === 0} onClick={() => setIndex(current - 1)} className={`${secondaryButton} flex-1`}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            Previous
          </button>
          <button type="button" disabled={current === pages.length - 1} onClick={() => setIndex(current + 1)} className={`${secondaryButton} flex-1`}>
            Next
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </details>
  );
}
