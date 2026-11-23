import { AlertTriangle, Building2, CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ApiError, api } from "../api/client";
import type { FieldDef, HospitalSync as Sync, RecordDetail } from "../api/types";
import { primaryButton, quietButton, secondaryButton } from "../ui/styles";
import { dateTimeLabel } from "../ui/time";
import { humanize } from "./fieldPaths";
import { shown } from "./hospital";

const STATUS: Record<Sync["status"], { text: string; tone: "ok" | "warn" }> = {
  sent: { text: "Sent to hospital", tone: "ok" },
  nothing_to_send: { text: "Nothing new for the hospital", tone: "ok" },
  unavailable: { text: "Hospital not reachable", tone: "warn" },
  not_at_hospital: { text: "Not at hospital", tone: "warn" },
  conflict: { text: "Conflict: the hospital changed some values after they were imported", tone: "warn" },
};

function labelOf(fields: FieldDef[], key: string): string {
  return fields.find((f) => f.key === key)?.label ?? humanize(key);
}

/** How sending this approved record back to the hospital went, with the admin's ways to finish it. */
export function HospitalSync({ record, canAct, onDone }: { record: RecordDetail; canAct: boolean; onDone: (r: RecordDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sync = record.hospital_sync;
  const fields = record.template.definition.fields;

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setProblem(null);
    try {
      const init: RequestInit = body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
      onDone(await api<RecordDetail>(`/records/${record.id}/${path}`, init));
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = sync ? STATUS[sync.status] : null;
  const Icon = status?.tone === "warn" ? AlertTriangle : status ? CheckCircle2 : Building2;
  return (
    <section aria-label="Hospital system" className={`space-y-2 rounded-xl border p-3.5 text-sm ${status?.tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-cyan-200 bg-cyan-50 text-cyan-950"}`}>
      <p className="flex items-center gap-2 font-medium">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {status ? status.text : "Not sent to the hospital yet"}
        {sync && <span className="font-normal opacity-80">· {dateTimeLabel(sync.at)}</span>}
      </p>
      {sync?.conflicts.map((c) => (
        <div key={c.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/80 p-2">
          <span className="flex-1">
            {labelOf(fields, c.key)}: hospital now has {shown(c.hospital_value)}; we had {shown(c.imported)}; you approved {shown(c.ours)}
          </span>
          {canAct && (
            <>
              <button type="button" disabled={busy} onClick={() => void post("hospital-conflict", { key: c.key, keep: "hospital", row_version: record.row_version })} className={secondaryButton}>
                Keep hospital's
              </button>
              <button type="button" disabled={busy} onClick={() => void post("hospital-conflict", { key: c.key, keep: "ours", row_version: record.row_version })} className={secondaryButton}>
                Keep ours
              </button>
            </>
          )}
        </div>
      ))}
      {canAct && (!sync || sync.status === "unavailable" || sync.status === "conflict") && (
        <button type="button" disabled={busy} onClick={() => void post("hospital-sync")} className={quietButton}>
          Try again
        </button>
      )}
      {problem && <p role="alert" className="text-red-800">{problem}</p>}
    </section>
  );
}

/** Before approving: which hospital values this record changes, so nobody overwrites them by accident. */
export function ApproveChanges({
  corrections,
  newCount,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  corrections: { key: string; label: string; from: unknown; to: unknown }[];
  newCount: number;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  return (
    <section aria-label="Changes to hospital values" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-950">
      <p className="font-medium">This record changes {corrections.length === 1 ? "a value" : `${corrections.length} values`} the hospital already holds:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {corrections.map((c) => (
          <li key={c.key}>
            {c.label}: {shown(c.from)} → {shown(c.to)}
          </li>
        ))}
      </ul>
      {newCount > 0 && <p>It also gives the hospital {newCount} new values it did not have.</p>}
      <p>Nothing goes to the hospital until an admin approves.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onConfirm} className={primaryButton}>
          {confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={quietButton}>
          Go back
        </button>
      </div>
    </section>
  );
}
