import { Camera, CornerUpLeft, FileSearch, Inbox, UserPlus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useRecords } from "../api/hooks";
import { useCurrentUser } from "../auth/RequireAuth";
import { useOutbox } from "../outbox/OutboxContext";
import { RecordList } from "../records/RecordList";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { secondaryButton, sectionTitle } from "../ui/styles";

function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

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
      {me.role === "doctor" ? <DoctorHome name={me.name} /> : <AdminHome />}
    </div>
  );
}

/** The two ways to start work. `primary` is the one most visits begin with, so it carries the colour. */
function ActionCard({ to, icon: Icon, title, text, primary = false }: { to: string; icon: LucideIcon; title: string; text: string; primary?: boolean }) {
  const tone = primary ? "bg-brand-700 text-white shadow-float hover:bg-brand-800 active:bg-brand-900" : "border border-ink-200 bg-white text-ink-900 hover:border-brand-400 hover:bg-brand-50/40 active:bg-brand-50";
  const chip = primary ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700";
  return (
    <Link to={to} className={`flex min-h-28 flex-col justify-between rounded-xl p-4 transition-colors lg:min-h-0 lg:flex-row lg:items-center lg:justify-start lg:gap-4 ${tone}`}>
      <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-lg ${chip}`}>
        <Icon className="size-6" />
      </span>
      <span className="mt-3 block lg:mt-0">
        <span className="block text-base font-semibold">{title}</span>
        <span className={`mt-0.5 block text-sm ${primary ? "text-brand-100" : "text-ink-700"}`}>{text}</span>
      </span>
    </Link>
  );
}

function DoctorHome({ name }: { name: string }) {
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
      <PageHeader title={`${greeting()}, ${name}`} subtitle="Start a capture, or pick up where you left off." />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        <div className="space-y-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <ActionCard primary to="/capture" icon={Camera} title="New capture" text="Photo of a report or film" />
            <ActionCard to="/import-patient" icon={UserPlus} title="Import patient" text="From the hospital system" />
          </div>
          <nav aria-label="My records" className="grid grid-cols-3 divide-x divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-white">
            <CountTile to="/records?status=draft&mine=1" label="Drafts" count={drafts.data?.length} />
            <CountTile to="/records?status=pending_admin&mine=1" label="With admin" count={waitingForAdmin.data?.length} />
            <CountTile to="/records?status=approved&mine=1" label="Done" count={approved.data?.length} />
          </nav>
        </div>

        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
          {(waiting.length > 0 || outbox.othersWaiting > 0 || refused.length > 0) && (
            <div className="space-y-3">
              {waiting.length > 0 && (
                <Notice tone="warn">
                  <p className="font-medium">{waiting.length} waiting to upload</p>
                  <button type="button" onClick={() => void outbox.flush()} className={`${secondaryButton} mt-2`}>
                    Try now
                  </button>
                </Notice>
              )}
              {outbox.othersWaiting > 0 && <p className="text-sm text-ink-700">{outbox.othersWaiting} waiting for another user to sign in on this device</p>}
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
            </div>
          )}
          {sentBack.length > 0 && (
            <ListSection icon={CornerUpLeft} title="Sent back to me" tone="text-amber-800">
              <RecordList records={sentBack} empty="" />
            </ListSection>
          )}
          {(reading.data?.length ?? 0) > 0 && (
            <ListSection icon={FileSearch} title="Being read">
              <RecordList records={reading.data ?? []} empty="" />
            </ListSection>
          )}
          <ListSection title="My drafts">
            {drafts.isPending ? <ListSkeleton rows={2} /> : <RecordList records={otherDrafts} empty="No drafts. Start with a new capture or import a patient." />}
          </ListSection>
        </div>
      </div>
    </>
  );
}

function ListSection({ title, icon: Icon, tone = "text-ink-900", children }: { title: string; icon?: LucideIcon; tone?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className={`flex items-center gap-2 ${sectionTitle} ${tone}`}>
        {Icon && <Icon aria-hidden="true" className="size-4.5" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function AdminHome() {
  const queue = useRecords({ status: "pending_admin" });
  const oldestFirst = [...(queue.data ?? [])].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const count = queue.data?.length;
  return (
    <section>
      <PageHeader
        title="Waiting for admin"
        titleAddon={
          count ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-violet-800">
              <Inbox aria-hidden="true" className="size-4" />
              {count}
            </span>
          ) : undefined
        }
        subtitle="Oldest first. Open a record to check the values, then approve it or send it back."
      />
      {queue.isPending ? <ListSkeleton /> : <RecordList records={oldestFirst} empty="Nothing is waiting. Records appear here when a doctor sends them." />}
    </section>
  );
}

function CountTile({ to, label, count }: { to: string; label: string; count: number | undefined }) {
  return (
    <Link to={to} className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-brand-50/50 active:bg-brand-50">
      <span className="text-2xl font-semibold tabular-nums leading-none text-ink-900">{count ?? "…"}</span>
      <span className="text-sm text-ink-700">{label}</span>
    </Link>
  );
}
