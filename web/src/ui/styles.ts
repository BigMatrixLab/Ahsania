/**
 * Shared class recipes. Radii step with importance: controls 8px, surfaces 12px, pills full.
 * Every control is at least 44px tall so it can be hit with a gloved or tired thumb.
 */
export const inputClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-500 transition-colors hover:border-ink-400 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/20 disabled:bg-ink-100 disabled:text-ink-600";
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-[0.9375rem] font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 active:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white px-4 py-2 text-[0.9375rem] font-medium text-ink-800 transition-colors hover:bg-ink-50 hover:border-ink-400 active:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50";
/** For actions that should not compete with the main one. */
export const quietButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50 active:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50";
export const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-red-800 active:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50";
/** A standalone surface. */
export const card = "rounded-xl border border-ink-200 bg-white p-4";
/** A list whose rows share one surface and are separated by hairlines (records, patients). */
export const listSurface = "divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white";
export const pageTitle = "text-2xl font-semibold tracking-tight text-ink-900";
export const sectionTitle = "text-base font-semibold text-ink-900";
