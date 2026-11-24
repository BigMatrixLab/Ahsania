import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api, json } from "../api/client";
import type { Me } from "../api/types";
import { Notice } from "../ui/Notice";
import { inputClass, primaryButton } from "../ui/styles";

export default function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/login", { method: "POST", body: json({ username, password }) });
      queryClient.clear(); // a new user must never see the previous user's cached records
      queryClient.setQueryData(["me"], me);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <img
        src="/login-hospital-bg.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-brand-950/80 via-brand-900/65 to-brand-950/75"
      />

      <div className="relative grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center gap-8 px-6 pb-6 pt-[max(2rem,env(safe-area-inset-top))] text-white lg:items-start lg:px-16 lg:py-14">
          <div className="flex w-fit items-center gap-4 rounded-xl bg-white px-4 py-3 lg:gap-5 lg:px-5 lg:py-4">
            <img src="/logo-amcgh.png" alt="Ahsania Mission Cancer & General Hospital" className="h-12 w-auto lg:h-16" />
            <span aria-hidden="true" className="h-10 w-px bg-ink-200 lg:h-12" />
            <img src="/logo-bigmatrix.png" alt="Big-Matrix Lab, Research & Development" className="h-9 w-auto lg:h-11" />
            <img src="/logo-nsu.png" alt="North South University" className="h-12 w-auto lg:h-16" />
          </div>
          <h1 className="text-center text-4xl font-semibold tracking-tight lg:text-left lg:text-5xl">AMCGH Data Capture</h1>
        </div>

        <div className="flex items-start justify-center px-4 pb-10 lg:items-center lg:px-12 lg:py-14">
          <form
            onSubmit={submit}
            className="w-full max-w-sm space-y-5 rounded-xl border border-white/80 bg-white/95 p-6 shadow-float backdrop-blur-md"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Sign in</h2>
            <label className="block">
              <span className="text-sm font-medium text-ink-800">ID</span>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink-800">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
