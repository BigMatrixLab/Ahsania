import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, json } from "../api/client";
import { useAccounts } from "../api/hooks";
import type { Account, Role } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { ROLE_LABEL } from "../auth/roles";
import { EmptyState } from "../ui/EmptyState";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { card, inputClass, primaryButton, secondaryButton, sectionTitle } from "../ui/styles";

export default function AccountsPage() {
  const me = useCurrentUser();
  const accounts = useAccounts(me.role === "admin");
  if (me.role !== "admin") return <EmptyState>Only an admin can manage accounts.</EmptyState>;
  return (
    <div>
      <PageHeader title="Accounts" subtitle="Doctors capture and review their own records. Admins approve them and manage accounts." />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        <div className="lg:col-start-1 lg:row-start-1">
          {accounts.isPending ? (
            <ListSkeleton />
          ) : accounts.isError ? (
            <Notice tone="error">{accounts.error.message}</Notice>
          ) : (
            <AccountTable accounts={accounts.data} myId={me.id} />
          )}
        </div>
        <div className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
          <CreateAccount />
        </div>
      </div>
    </div>
  );
}

function AccountTable({ accounts, myId }: { accounts: Account[]; myId: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="hidden border-b border-ink-200 bg-ink-50 text-xs font-semibold text-ink-700 md:table-header-group">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} isMe={a.id === myId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountRow({ account: a, isMe }: { account: Account; isMe: boolean }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function update(change: { active?: boolean; password?: string }, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api<Account>(`/admin/users/${a.id}`, { method: "PATCH", body: json(change) });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setPassword(null);
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="block px-4 py-3.5 md:table-row md:p-0">
      <td className="block font-semibold text-ink-900 md:table-cell md:px-4 md:py-3.5">{a.name}</td>
      <td className="inline-block pr-3 text-ink-700 md:table-cell md:px-4 md:py-3.5">{a.username}</td>
      <td className="inline-block pr-3 text-ink-700 md:table-cell md:px-4 md:py-3.5">{ROLE_LABEL[a.role]}</td>
      <td className="inline-block md:table-cell md:px-4 md:py-3.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.active ? "bg-brand-50 text-brand-800" : "bg-amber-100 text-amber-900"}`}>
          <span aria-hidden="true" className={`size-1.5 rounded-full ${a.active ? "bg-brand-600" : "bg-amber-600"}`} />
          {a.active ? "Active" : "Deactivated"}
        </span>
      </td>
      <td className="mt-3 block space-y-2 md:mt-0 md:table-cell md:px-4 md:py-3">
        <div className="flex flex-wrap gap-2 md:justify-end">
          {!isMe && (
            <button type="button" disabled={busy} onClick={() => update({ active: !a.active }, a.active ? "Deactivated" : "Reactivated")} className={secondaryButton}>
              {a.active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          {password === null && (
            <button type="button" disabled={busy} onClick={() => setPassword("")} className={secondaryButton}>
              Set password…
            </button>
          )}
        </div>
        {password !== null && (
          <div className="flex flex-wrap items-end gap-2 md:justify-end">
            <label className="block">
              <span className="text-xs font-medium text-ink-800">New password for {a.username}</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </label>
            <button type="button" disabled={busy || password.length < 10} onClick={() => update({ password }, "Password changed")} className={primaryButton}>
              Save
            </button>
            <button type="button" onClick={() => setPassword(null)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="text-xs text-ink-700 md:text-right">
            {message}
          </p>
        )}
      </td>
    </tr>
  );
}

function CreateAccount() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("doctor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Account>("/admin/users", { method: "POST", body: json({ name, username, password, role }) });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setName("");
      setUsername("");
      setPassword("");
      setRole("doctor");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-4`}>
      <h2 className={`${sectionTitle} flex items-center gap-2`}>
        <UserPlus aria-hidden="true" className="size-4.5 text-brand-700" />
        New account
      </h2>
      <label className="block">
        <span className="text-sm font-medium text-ink-800">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Rahman" className={inputClass} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink-800">ID</span>
        <input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dr.rahman" autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputClass} />
      </label>
      <div>
        <label className="block">
          <span className="text-sm font-medium text-ink-800">Password</span>
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={inputClass} />
        </label>
        <p className="mt-1 text-xs text-ink-600">At least 10 characters.</p>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-ink-800">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
        Create account
      </button>
    </form>
  );
}
