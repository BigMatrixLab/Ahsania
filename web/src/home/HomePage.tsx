import { Camera, UserPlus, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useRecords } from "../api/hooks";
import { useCurrentUser } from "../auth/RequireAuth";
import { useOutbox } from "../outbox/OutboxContext";
import { RecordList } from "../records/RecordList";
import { Notice } from "../ui/Notice";
import { ListSkeleton } from "../ui/Skeleton";
import { secondaryButton } from "../ui/styles";

export default function HomePage() {
  const me = useCurrentUser();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  return (
    <div className="space-y-5">
      {notice && (
        <Notice tone="ok" role="status">
          {notice}
        </Notice>
      )}
      {me.role === "doctor" ? <DoctorHome /> : <AdminHome />}
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, text }: { to: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link to={to} className="block rounded-2xl bg-white p-4 shadow-lg shadow-teal-900/10 ring-1 ring-teal-100 transition hover:ring-teal-400 active:bg-teal-50">
      <span aria-hidden="true" className="mb-3 grid size-11 place-items-center rounded-xl bg-teal-100 text-teal-800">
        <Icon className="size-6" />
      </span>
      <span className="block font-bold text-teal-900">{title}</span>
      <span className="mt-0.5 block text-sm text-slate-700">{text}</span>
    </Link>
  );
}

function DoctorHome() {
  const outbox = useOutbox();
  const drafts = useRecords({ status: "draft", mine: true });
  const reading = useRecords({ status: "processing", mine: true });
  const waitingForAdmin = useRecords({ status: "pending_admin", mine: true });
  const approved = useRecords({ status: "approved", mine: true });
  const waiting = outbox.items.filter((item) => !item.failed);
  const refused = outbox.items.filter((item) => item.failed);
  const sentBack = (drafts.data ?? []).filter((r) => r.sent_to_admin);
  const otherDrafts = (drafts.data ?? []).filter((r) => !r.sent_to_admin);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <ActionCard to="/new-patient" icon={UserPlus} title="New patient" text="First-visit form" />
        <ActionCard to="/capture" icon={Camera} title="New capture" text="Photo of a report or film" />
      </div>
      <nav aria-label="My records" className="flex flex-wrap gap-2 text-sm">
        <CountChip to="/records?status=draft&mine=1" label="Drafts" count={drafts.data?.length} />
        <CountChip to="/records?status=pending_admin&mine=1" label="With admin" count={waitingForAdmin.data?.length} />
        <CountChip to="/records?status=approved&mine=1" label="Done" count={approved.data?.length} />
      </nav>
      {waiting.length > 0 && (
        <Notice tone="warn">
          <p className="font-medium">{waiting.length} waiting to upload</p>
          <button type="button" onClick={() => void outbox.flush()} className={`${secondaryButton} mt-2`}>
            Try now
          </button>
        </Notice>
      )}
      {outbox.othersWaiting > 0 && <p className="text-sm text-slate-700">{outbox.othersWaiting} waiting for another user to sign in on this device</p>}
      {refused.map((item) => (
        <Notice key={item.id} tone="error">
          <p>
            Upload refused for {item.meta.reg_no ?? "an earlier capture"}: {item.error}
          </p>
          <button type="button" onClick={() => void outbox.discard(item.id)} className={`${secondaryButton} mt-2`}>
            Discard
          </button>
        </Notice>
      ))}
      {sentBack.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-amber-900">Sent back to me</h2>
          <RecordList records={sentBack} empty="" />
        </section>
      )}
      {(reading.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-slate-800">Being read</h2>
          <RecordList records={reading.data ?? []} empty="" />
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold text-slate-800">My drafts</h2>
        {drafts.isPending ? <ListSkeleton rows={2} /> : <RecordList records={otherDrafts} empty="No drafts. Start with a new patient or a new capture." />}
      </section>
    </>
  );
}

function AdminHome() {
  const queue = useRecords({ status: "pending_admin" });
  const oldestFirst = [...(queue.data ?? [])].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-bold text-slate-800">Waiting for admin</h1>
      {queue.isPending ? <ListSkeleton /> : <RecordList records={oldestFirst} empty="Nothing is waiting. Records appear here when a doctor sends them." />}
    </section>
  );
}

function CountChip({ to, label, count }: { to: string; label: string; count: number | undefined }) {
  return (
    <Link to={to} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-teal-200 bg-white px-3 font-medium text-teal-800 transition-colors hover:bg-teal-50">
      {label} <span className="font-bold tabular-nums">{count ?? "…"}</span>
    </Link>
  );
}
