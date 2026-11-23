import { useQueryClient } from "@tanstack/react-query";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, api, json } from "../api/client";
import { useRecord } from "../api/hooks";
import type { EventOut, RecordDetail, SourceBox } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { StatusBadge } from "../ui/StatusBadge";
import { card, inputClass, primaryButton, quietButton, secondaryButton, sectionTitle } from "../ui/styles";
import { dateLabel, dateTimeLabel } from "../ui/time";
import { DeleteButton } from "./DeleteButton";
import { labelOfPath, sameValues } from "./fieldPaths";
import { FormRenderer } from "./FormRenderer";
import { hospitalChanges, withDerived } from "./hospital";
import { ApproveChanges, HospitalSync } from "./HospitalSync";
import { historyLines } from "./history";
import { PageViewer } from "./PageViewer";
import { availableActions, canDelete, canEdit, type UiAction } from "./permissions";
import { useAutosave, type SaveState } from "./useAutosave";

/** The server's 409 for a stale row_version. Any other 409 carries its own reason, which is shown as it is. */
const CONFLICT = "Someone else changed this record — reload";

const DONE: Record<UiAction, string> = {
  submit: "Sent to the admin",
  approve: "Approved",
  return: "Sent back to the doctor",
  reopen: "Reopened",
  fill_by_hand: "Stopped reading — fill the form in by hand",
};

export default function RecordPage() {
  const { id = "" } = useParams();
  const record = useRecord(id);
  if (record.isPending) return <ListSkeleton />;
  if (record.isError) return <Notice tone="error">{record.error.message}</Notice>;
  return <RecordView key={record.data.id} record={record.data} />;
}

function RecordView({ record: r }: { record: RecordDetail }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState(r.values);
  const [syncedVersion, setSyncedVersion] = useState(r.row_version);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [dialog, setDialog] = useState<"return" | "reopen" | null>(null);
  const [comment, setComment] = useState("");
  const [sources, setSources] = useState<SourceBox[]>([]);
  const [triedToSend, setTriedToSend] = useState(false);
  const [confirming, setConfirming] = useState<"submit" | "approve" | null>(null);

  // Always the newest answers and the newest server copy, for saves that finish after a re-render.
  const latest = useRef(r);
  if (r.row_version >= latest.current.row_version) latest.current = r;
  const onScreen = useRef(values);
  onScreen.current = values;
  const ownVersion = useRef(r.row_version);

  // When someone else changed the server copy (the reading finished, the admin sent it back), show their values.
  // Never after our own save: the doctor may have typed more while it was on its way.
  if (syncedVersion !== r.row_version) {
    setSyncedVersion(r.row_version);
    if (ownVersion.current !== r.row_version) setValues(r.values);
  }

  const editable = canEdit(me.role, r.status);
  const isDirty = () => !sameValues(onScreen.current, latest.current.values);
  const actions = availableActions(me.role, r.status);
  const errors = Object.fromEntries(r.errors.map((e) => [e.path, e.message]));
  const lastReturn = r.status === "draft" ? [...r.events].reverse().find((e) => e.action === "return" || e.action === "reopen") : undefined;
  const isForm = r.template.kind === "form";
  const fields = r.template.definition.fields;
  const stillNeeded = triedToSend ? r.errors : [];
  const isHospital = Boolean(r.template.definition.hospital);
  const changes = isHospital ? hospitalChanges(r.hospital_snapshot, editable ? values : r.values, fields) : null;

  /** Approving a record that changes hospital values first lists those changes and asks again. */
  function approveStep(action: "submit" | "approve") {
    if (changes && changes.corrections.length > 0 && confirming !== action) setConfirming(action);
    else {
      setConfirming(null);
      void run(action);
    }
  }

  function store(updated: RecordDetail) {
    latest.current = updated;
    queryClient.setQueryData(["record", updated.id], updated);
    void queryClient.invalidateQueries({ queryKey: ["records"] });
  }

  function failed(e: unknown, fallback: string) {
    if (e instanceof ApiError && e.status === 409 && e.message === CONFLICT) setConflict(true);
    else setMessage(e instanceof Error ? e.message : fallback);
  }

  /** Sends what is on screen. A lost connection is reported by the save status and tried again. */
  async function saveNow(): Promise<boolean> {
    try {
      const updated = await api<RecordDetail>(`/records/${r.id}/values`, {
        method: "PATCH",
        body: json({ row_version: latest.current.row_version, values: onScreen.current }),
      });
      ownVersion.current = updated.row_version;
      store(updated);
      return true;
    } catch (e) {
      if (e instanceof ApiError) failed(e, "Save failed");
      return false;
    }
  }

  const { state: saveState, flush } = useAutosave({ isDirty, save: saveNow, enabled: editable && !conflict, watch: values });

  // Leaving the page keeps the answers: send what has not gone yet, and warn before closing the tab with unsaved answers.
  const finalSave = useRef(() => {});
  finalSave.current = () => {
    if (editable && !conflict && isDirty()) void saveNow();
  };
  useEffect(() => () => finalSave.current(), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isDirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On a phone the photo sits above the form, so the comment box and its Confirm can open below the screen.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dialog) bar.current?.scrollIntoView({ block: "end" });
  }, [dialog]);

  async function run(action: UiAction, withComment?: string) {
    setBusy(true);
    setMessage(null);
    if (action === "submit") setTriedToSend(true);
    try {
      if (editable && !(await flush())) {
        if (!conflict) setMessage("Your answers could not be saved. Check the connection and try again.");
        return;
      }
      store(
        await api<RecordDetail>(`/records/${r.id}/transition`, {
          method: "POST",
          body: json({ action, comment: withComment ?? null, row_version: latest.current.row_version }),
        }),
      );
      setDialog(null);
      setComment("");
      setMessage(DONE[action]);
    } catch (e) {
      failed(e, "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function goToField(path: string) {
    const field = document.querySelector(`[data-field="${CSS.escape(path)}"]`);
    field?.scrollIntoView({ block: "center" });
    field?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }

  const form = (
    <FormRenderer
      fields={fields}
      values={values}
      onChange={isHospital ? (v) => setValues(withDerived(v)) : setValues}
      errors={errors}
      readOnly={!editable}
      flags={lastReturn?.field_flags ?? {}}
      extraction={r.extraction}
      onFieldFocus={(_, ai) => setSources(ai?.sources ?? [])}
      showRequired={triedToSend}
      pages={r.files}
      hospital={r.hospital_snapshot}
    />
  );

  const actionBar = (
    <div ref={bar} className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-ink-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-bar backdrop-blur empty:hidden md:mx-0 md:rounded-xl md:border md:p-4 md:shadow-float">
      {editable && <SaveStatus state={saveState} dirty={!sameValues(values, r.values)} />}
      {message && (
        <p role="status" className="text-sm font-medium text-ink-900">
          {message}
        </p>
      )}
      {stillNeeded.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="font-semibold">Still needed: </span>
          {stillNeeded.map((e, i) => (
            <span key={e.path}>
              {i > 0 && ", "}
              <button type="button" onClick={() => goToField(e.path)} className="font-semibold text-brand-800 underline underline-offset-2">
                {labelOfPath(fields, e.path)}
              </button>
            </span>
          ))}
        </p>
      )}
      {dialog && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink-800">
            {dialog === "return" ? "What needs fixing?" : "Reason for reopening"}
            <textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={inputClass} />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !comment.trim()} onClick={() => void run(dialog, comment)} className={primaryButton}>
              Confirm
            </button>
            <button type="button" onClick={() => setDialog(null)} className={quietButton}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {confirming && changes && (
        <ApproveChanges
          corrections={changes.corrections}
          newCount={changes.newCount}
          confirmLabel={confirming === "submit" ? "Yes, send to admin" : "Yes, approve"}
          busy={busy}
          onConfirm={() => approveStep(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
      <div className={`flex flex-wrap items-center gap-2 ${dialog || confirming ? "hidden" : ""}`}>
        {actions.includes("submit") && (
          <button type="button" disabled={busy} onClick={() => approveStep("submit")} className={primaryButton}>
            Approve and send to admin
          </button>
        )}
        {actions.includes("approve") && (
          <button type="button" disabled={busy} onClick={() => approveStep("approve")} className={primaryButton}>
            Approve
          </button>
        )}
        {actions.includes("return") && (
          <button type="button" disabled={busy} onClick={() => setDialog("return")} className={secondaryButton}>
            Send back…
          </button>
        )}
        {actions.includes("reopen") && (
          <button type="button" disabled={busy} onClick={() => setDialog("reopen")} className={secondaryButton}>
            Reopen…
          </button>
        )}
        {canDelete(me, r) && <DeleteButton recordId={r.id} onDeleted={() => navigate("/", { state: { notice: "Capture deleted." } })} />}
      </div>
    </div>
  );

  return (
    <div className={`space-y-4 ${isForm ? "mx-auto max-w-3xl" : ""}`}>
      <PageHeader
        back={{ to: `/patients/${encodeURIComponent(r.reg_no)}`, label: `Patient ${r.reg_no}` }}
        title={r.template_title}
        titleAddon={<StatusBadge status={r.status} main />}
        subtitle={
          <>
            {isForm ? "Started" : "Uploaded"} by {r.created_by_name}
            {r.document_date ? ` · ${dateLabel(r.document_date)}` : ""}
          </>
        }
      />

      {r.duplicate_of.length > 0 && (
        <Notice tone="warn">
          This looks already uploaded for this patient:
          {r.duplicate_of.map((d) => (
            <Link key={d} to={`/records/${d}`} className="ml-2 font-medium underline">
              {d.slice(0, 8)}
            </Link>
          ))}
        </Notice>
      )}
      {lastReturn && (
        <Notice tone="warn">
          {lastReturn.action === "reopen" ? "Reopened" : "Sent back"} by {lastReturn.actor_name}: {lastReturn.comment}
        </Notice>
      )}
      {r.status === "processing" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3.5 text-sm text-ink-800">
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-brand-700 motion-reduce:animate-none" />
          <span className="flex-1">Reading this document…</span>
          {actions.includes("fill_by_hand") && (
            <button type="button" disabled={busy} onClick={() => void run("fill_by_hand")} className={secondaryButton}>
              Fill by hand now
            </button>
          )}
        </div>
      )}
      {r.status === "draft" && r.extraction_status === "failed" && <Notice tone="warn">This document could not be read. Fill the form in by hand.</Notice>}
      {r.status === "draft" && r.extraction && (
        <p className="text-sm text-ink-700">
          Filled in from the photo. Check the amber fields, and tap any field to see where it was read.
        </p>
      )}
      {isForm && editable && <p className="text-sm text-ink-700">Answers save by themselves, so you can stop and come back. Only the starred questions are needed before sending.</p>}
      {isHospital && r.hospital_snapshot && editable && (
        <p className="text-sm text-ink-700">Fields marked “From hospital” came from the hospital system. Fill in the rest; after an admin approves, the hospital gets them too.</p>
      )}
      {isHospital && r.status === "approved" && <HospitalSync record={r} canAct={me.role === "admin"} onDone={store} />}
      {conflict && (
        <Notice tone="error">
          {CONFLICT}
          <button
            type="button"
            className={`${secondaryButton} ml-2`}
            onClick={() => {
              setConflict(false);
              ownVersion.current = -1;
              void queryClient.invalidateQueries({ queryKey: ["record", r.id] });
            }}
          >
            Reload
          </button>
        </Notice>
      )}

      {isForm ? (
        <div className="space-y-4">
          {form}
          {actionBar}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <PageViewer files={r.files} marks={sources} />
          <div className="space-y-4">
            {form}
            {actionBar}
          </div>
        </div>
      )}
      <History events={r.events} isForm={isForm} />
    </div>
  );
}

/** Floats just above the action bar, so the bar never changes height as the doctor types. */
function SaveStatus({ state, dirty }: { state: SaveState; dirty: boolean }) {
  const base = "absolute bottom-full right-3 mb-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs shadow-float ring-1 ring-ink-200";
  if (state === "error") {
    return (
      <span className={`${base} font-medium text-amber-800`}>
        <CloudOff aria-hidden="true" className="size-3.5" />
        Not saved yet, check the connection
      </span>
    );
  }
  if (dirty || state === "saving") return <span className={`${base} text-ink-700`}>Saving…</span>;
  if (state !== "saved") return null;
  return (
    <span className={`${base} text-brand-800`}>
      <Check aria-hidden="true" className="size-3.5" />
      Saved
    </span>
  );
}

function History({ events, isForm }: { events: EventOut[]; isForm: boolean }) {
  return (
    <section className={card}>
      <h2 className={`mb-3 ${sectionTitle}`}>History</h2>
      <ol className="space-y-2 text-sm text-ink-700">
        {historyLines(events, isForm ? "started this form" : undefined).map((line) => (
          <li key={line.id} className="relative pl-5 before:absolute before:left-0 before:top-[0.5625rem] before:size-1.5 before:rounded-full before:bg-ink-400">
            <span className="tabular-nums text-ink-600">{dateTimeLabel(line.at)}</span> · {line.actor} {line.text}
            {line.comment ? `: ${line.comment}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
