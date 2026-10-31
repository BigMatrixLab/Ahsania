import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Options {
  isDirty: () => boolean;
  /** Sends what is on screen; resolves false if it could not be saved. */
  save: () => Promise<boolean>;
  enabled: boolean;
  /** Changes whenever the doctor changes something. */
  watch: unknown;
  delay?: number;
  retry?: number;
}

/** Saves shortly after the typing stops, one save at a time, and keeps trying after a failure. */
export function useAutosave({ isDirty, save, enabled, watch, delay = 1200, retry = 5000 }: Options) {
  const [state, setState] = useState<SaveState>("idle");
  const running = useRef<Promise<boolean> | null>(null);
  const latest = useRef({ isDirty, save });
  latest.current = { isDirty, save };

  const flush = useCallback(async (): Promise<boolean> => {
    while (running.current) await running.current;
    if (!latest.current.isDirty()) return true;
    setState("saving");
    const attempt = latest.current.save();
    running.current = attempt;
    const ok = await attempt;
    running.current = null;
    setState(ok ? "saved" : "error");
    return ok;
  }, []);

  useEffect(() => {
    if (!enabled || state === "saving" || !latest.current.isDirty()) return;
    const timer = setTimeout(() => void flush(), state === "error" ? retry : delay);
    return () => clearTimeout(timer);
  }, [enabled, watch, state, delay, retry, flush]);

  return { state, flush };
}
