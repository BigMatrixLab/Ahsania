import { Check } from "lucide-react";
import type { PatientSummary } from "../api/types";
import { pairStatus } from "./summary";

export function PairBadge({ patient }: { patient: PatientSummary }) {
  const { label, done } = pairStatus(patient);
  if (!done) return <span className="text-xs font-medium text-ink-700">{label}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-semibold text-white">
      <Check aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
