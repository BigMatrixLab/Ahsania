import { useQueryClient } from "@tanstack/react-query";
import { Camera, ClipboardList, House, KeyRound, LogOut, Upload, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { api } from "../api/client";
import { useCurrentUser } from "../auth/RequireAuth";
import { ROLE_LABEL } from "../auth/roles";
import { OutboxProvider, useOutbox } from "../outbox/OutboxContext";
import { Notice } from "../ui/Notice";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Screens that finish with their own action bar at the bottom: the phone's tab bar steps aside for them. */
const FOCUSED = [/^\/capture/, /^\/import-patient/, /^\/records\/[^/]+/];

function initials(name: string): string {
  const letters = name
    .replace(/^(dr|prof)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]);
  return letters.join("").toUpperCase() || "?";
}

export function Layout({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [logoutError, setLogoutError] = useState(false);
  const focused = FOCUSED.some((pattern) => pattern.test(pathname));

  async function logout() {
    setLogoutError(false);
    try {
      await api<void>("/auth/logout", { method: "POST" });
    } catch {
      setLogoutError(true);
      return;
    }
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  const links: NavItem[] = [{ to: "/", label: "Home", icon: House, end: true }];
  if (me.role === "doctor") links.push({ to: "/capture", label: "Capture", icon: Camera });
  links.push({ to: "/patients", label: "Patients", icon: Users }, { to: "/records", label: "All records", icon: ClipboardList });
  if (me.role === "admin") links.push({ to: "/accounts", label: "Accounts", icon: KeyRound });

  return (
    <OutboxProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 md:px-6">
            <Link to="/" className="flex min-w-0 items-center gap-3 rounded-lg py-1 pr-2">
              <img src="/logo-amcgh.png" alt="" className="h-9 w-auto shrink-0" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">AMCGH Capture</span>
                <span className="hidden truncate text-xs text-ink-600 lg:block">Ahsania Mission Cancer &amp; General Hospital</span>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-1.5 md:gap-3">
              <OutboxCount />
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                  {initials(me.name)}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="max-w-40 truncate text-sm font-semibold text-ink-900 sr-only md:not-sr-only">{me.name}</span>
                  <span className="hidden text-xs text-ink-600 md:block">{ROLE_LABEL[me.role]}</span>
                </span>
              </div>
              <button type="button" onClick={() => void logout()} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900">
                <LogOut aria-hidden="true" className="size-[1.125rem]" />
                <span className="sr-only md:not-sr-only">Log out</span>
              </button>
            </div>
          </div>
          {logoutError && (
            <div className="mx-auto max-w-[88rem] px-4 pb-3 md:px-6">
              <Notice tone="error">Could not sign out. Check the connection and try again.</Notice>
            </div>
          )}
        </header>

        <div className="mx-auto flex max-w-[88rem]">
          <nav
            aria-label="Main"
            className={`fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-bar md:static md:z-auto md:w-60 md:shrink-0 md:border-t-0 md:bg-transparent md:pb-0 md:shadow-none ${focused ? "max-md:hidden" : ""}`}
          >
            <ul className="mx-auto flex max-w-lg md:sticky md:top-14 md:max-w-none md:flex-col md:gap-1 md:px-4 md:py-6">
              {links.map(({ to, label, icon: Icon, end }) => (
                <li key={to} className="flex-1 md:flex-none">
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-semibold transition-colors md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:text-sm ${
                        isActive ? "text-brand-800 md:bg-brand-50" : "text-ink-600 hover:text-ink-900 md:hover:bg-ink-100"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors md:h-auto md:w-auto ${isActive ? "bg-brand-100 md:bg-transparent" : ""}`}>
                          <Icon aria-hidden="true" className="size-[1.375rem] md:size-5" />
                        </span>
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <main className={`min-w-0 flex-1 px-4 pt-5 md:px-8 md:pb-12 md:pt-8 ${focused ? "pb-6" : "pb-28"}`}>
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </OutboxProvider>
  );
}

function OutboxCount() {
  const { items } = useOutbox();
  const waiting = items.filter((item) => !item.failed).length;
  if (waiting === 0) return null;
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-100 px-2.5 text-sm font-semibold text-amber-950 ring-1 ring-amber-300">
      <Upload aria-hidden="true" className="size-4" />
      <span className="tabular-nums">{waiting}</span>
      <span className="sr-only sm:not-sr-only">waiting to upload</span>
    </span>
  );
}
