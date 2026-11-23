import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useMe } from "../api/hooks";
import type { Me } from "../api/types";
import { Notice } from "../ui/Notice";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  // A failed background refetch keeps `data`; unmounting the app then would stop the outbox and lose a capture in progress.
  if (me.data) return <>{children}</>;
  if (me.isPending) {
    return (
      <div role="status" className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2.5 text-ink-700">
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-brand-700 motion-reduce:animate-none" />
          Loading…
        </p>
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <Notice tone="error">Cannot reach the server: {me.error.message}</Notice>
      </div>
    );
  }
  return <Navigate to="/login" replace />;
}

/** The signed-in user. Only call inside <RequireAuth>. */
export function useCurrentUser(): Me {
  const { data } = useMe();
  if (!data) throw new Error("useCurrentUser used outside RequireAuth");
  return data;
}
