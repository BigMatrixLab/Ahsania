import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { api } from "../api/client";
import { useCurrentUser } from "../auth/RequireAuth";
import { ROLE_LABEL } from "../auth/roles";
import { OutboxProvider, useOutbox } from "../outbox/OutboxContext";
import { brandBand, logoBadge } from "../ui/styles";

export function Layout({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const atHome = useLocation().pathname === "/";
  const [logoutError, setLogoutError] = useState(false);

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

  const links = [
    { to: "/", label: "Home" },
    { to: "/patients", label: "Patients" },
    { to: "/records", label: "All records" },
  ];
  if (me.role === "admin") links.push({ to: "/accounts", label: "Accounts" });

  return (
    <OutboxProvider>
      <div className="min-h-screen">
        <header className={brandBand}>
          <div className="mx-auto max-w-6xl px-4 pb-9 pt-3">
            <div className="flex items-center gap-2.5">
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={`${logoBadge} size-9 rounded-lg p-0.5`}>
                  <img src="/logo-amcgh.png" alt="Ahsania Mission Cancer & General Hospital" className="h-full w-auto" />
                </span>
                <span className={`${logoBadge} size-9 rounded-lg p-0.5`}>
                  <img src="/logo-nsu.png" alt="North South University" className="h-full w-auto" />
                </span>
                <span className={`${logoBadge} h-9 rounded-lg px-1.5`}>
                  <img src="/logo-bigmatrix.png" alt="Big-Matrix Lab" className="h-5 w-auto" />
                </span>
              </span>
              <span className="hidden font-semibold sm:inline">AMCGH Capture</span>
              <button type="button" onClick={() => void logout()} className="ml-auto min-h-9 shrink-0 whitespace-nowrap rounded-lg border border-white/40 px-3 text-sm font-medium transition-colors hover:bg-white/10">
                Log out
              </button>
            </div>
            {atHome ? (
              <>
                <p className="mt-3 text-sm text-white/90">{ROLE_LABEL[me.role]}</p>
                <p className="text-xl font-bold">{me.name}</p>
              </>
            ) : (
              <p className="sr-only">
                {me.name} · {ROLE_LABEL[me.role]}
              </p>
            )}
            <nav className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to !== "/patients"}
                  className={({ isActive }) =>
                    `inline-flex min-h-9 items-center rounded-full px-3 font-medium transition-colors ${isActive ? "bg-white text-teal-800" : "bg-white/15 text-white hover:bg-white/25"}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <OutboxCount />
            </nav>
            {logoutError && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                Could not sign out. Check the connection and try again.
              </p>
            )}
          </div>
        </header>
        <main className="relative mx-auto -mt-6 max-w-6xl rounded-t-3xl bg-slate-50 px-4 pb-10 pt-5">{children}</main>
      </div>
    </OutboxProvider>
  );
}

function OutboxCount() {
  const { items } = useOutbox();
  const waiting = items.filter((item) => !item.failed).length;
  return waiting > 0 ? <span className="inline-flex min-h-9 items-center rounded-full bg-amber-300 px-3 font-medium text-amber-950">{waiting} waiting to upload</span> : null;
}
