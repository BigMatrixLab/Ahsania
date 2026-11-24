/** Placeholder rows while a list loads, so the page does not jump when it arrives. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="space-y-2.5 px-4 py-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-ink-200/70 motion-reduce:animate-none" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-ink-100 motion-reduce:animate-none" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-ink-100 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
