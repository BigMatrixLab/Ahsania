import { useQueryClient } from "@tanstack/react-query";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, api, json } from "../api/client";
import { useRecord } from "../api/hooks";
import type { EventOut, RecordDetail, SourceBox } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { Notice } from "../ui/Notice";
import { ListSkeleton } from "../ui/Skeleton";
import { StatusBadge } from "../ui/StatusBadge";
import { card, inputClass, primaryButton, quietButton, secondaryButton } from "../ui/styles";
import { dateLabel, dateTimeLabel } from "../ui/time";
import { DeleteButton } from "./DeleteButton";
import { labelOfPath, sameValues } from "./fieldPaths";
import { FormRenderer } from "./FormRenderer";
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
      onChange={setValues}
      errors={errors}
      readOnly={!editable}
      flags={lastReturn?.field_flags ?? {}}
      extraction={r.extraction}
      onFieldFocus={(_, ai) => setSources(ai?.sources ?? [])}
      showRequired={triedToSend}
      pages={r.files}
    />
  );

  const actionBar = (
    <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur empty:hidden md:mx-0 md:rounded-2xl md:border md:shadow-sm">
      {editable && <SaveStatus state={saveState} dirty={!sameValues(values, r.values)} />}
      {message && (
        <p role="status" className="text-sm font-medium text-slate-800">
          {message}
        </p>
      )}
      {stillNeeded.length > 0 && (
        <p className="text-sm text-slate-800">
          <span className="font-semibold">Still needed: </span>
          {stillNeeded.map((e, i) => (
            <span key={e.path}>
              {i > 0 && ", "}
              <button type="button" onClick={() => goToField(e.path)} className="font-medium text-teal-800 underline underline-offset-2">
                {labelOfPath(fields, e.path)}
              </button>
            </span>
          ))}
        </p>
      )}
      {dialog && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">
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
      <div className={`flex flex-wrap items-center gap-2 ${dialog ? "hidden" : ""}`}>
        {actions.includes("submit") && (
          <button type="button" disabled={busy} onClick={() => void run("submit")} className={primaryButton}>
            Approve and send to admin
          </button>
        )}
        {actions.includes("approve") && (
          <button type="button" disabled={busy} onClick={() => void run("approve")} className={primaryButton}>
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
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-800">{r.template_title}</h1>
          <StatusBadge status={r.status} main />
        </div>
        <p className="mt-1 text-sm text-slate-700">
          <Link to={`/patients/${encodeURIComponent(r.reg_no)}`} className="font-semibold text-teal-800 underline underline-offset-2">
            Patient {r.reg_no}
          </Link>
          {" · "}
          {isForm ? "Started" : "Uploaded"} by {r.created_by_name}
          {r.document_date ? ` · ${dateLabel(r.document_date)}` : ""}
        </p>
      </header>

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
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-800">
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
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
        <p className="text-sm text-slate-700">
          Filled in from the photo. Check the amber fields, and tap any field to see where it was read.
        </p>
      )}
      {isForm && editable && <p className="text-sm text-slate-700">Answers save by themselves, so you can stop and come back. Only the starred questions are needed before sending.</p>}
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
        <div className="grid gap-4 md:grid-cols-2">
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
  const base = "absolute bottom-full right-3 mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs shadow-sm ring-1 ring-slate-200";
  if (state === "error") {
    return (
      <span className={`${base} font-medium text-amber-800`}>
        <CloudOff aria-hidden="true" className="size-3.5" />
        Not saved yet, check the connection
      </span>
    );
  }
  if (dirty || state === "saving") return <span className={`${base} text-slate-700`}>Saving…</span>;
  if (state !== "saved") return null;
  return (
    <span className={`${base} text-teal-800`}>
      <Check aria-hidden="true" className="size-3.5" />
      Saved
    </span>
  );
}

function History({ events, isForm }: { events: EventOut[]; isForm: boolean }) {
  return (
    <section className={card}>
      <h2 className="mb-2 font-semibold text-slate-800">History</h2>
      <ol className="space-y-1.5 text-sm text-slate-700">
        {historyLines(events, isForm ? "started this form" : undefined).map((line) => (
          <li key={line.id}>
            <span className="tabular-nums text-slate-600">{dateTimeLabel(line.at)}</span> · {line.actor} {line.text}
            {line.comment ? `: ${line.comment}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
