/** Placeholder rows while a list loads, so the page does not jump when it arrives. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-20 animate-pulse rounded-2xl bg-slate-200/60 motion-reduce:animate-none" />
      ))}
    </div>
  );
}
