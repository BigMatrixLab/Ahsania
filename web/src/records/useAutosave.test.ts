// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

const DELAY = 1000;
const RETRY = 5000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(save: () => Promise<boolean>, { dirty = true, enabled = true } = {}) {
  const form = { dirty };
  const hook = renderHook(
    ({ watch, on }) => useAutosave({ isDirty: () => form.dirty, save, enabled: on, watch, delay: DELAY, retry: RETRY }),
    { initialProps: { watch: 0, on: enabled } },
  );
  return { form, ...hook };
}

const pass = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useAutosave", () => {
  it("saves once, shortly after the typing stops", async () => {
    const save = vi.fn(async () => true);
    const { rerender, form } = setup(save);
    await pass(DELAY - 100);
    rerender({ watch: 1, on: true }); // typed again: the wait starts over
    await pass(DELAY - 100);
    expect(save).not.toHaveBeenCalled();
    save.mockImplementation(async () => {
      form.dirty = false;
      return true;
    });
    await pass(200);
    expect(save).toHaveBeenCalledTimes(1);
    await pass(DELAY * 3);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does nothing when nothing changed", async () => {
    const save = vi.fn(async () => true);
    setup(save, { dirty: false });
    await pass(DELAY * 3);
    expect(save).not.toHaveBeenCalled();
  });

  it("does nothing while it is switched off, as after a conflict", async () => {
    const save = vi.fn(async () => true);
    setup(save, { enabled: false });
    await pass(DELAY * 3);
    expect(save).not.toHaveBeenCalled();
  });

  it("never runs two saves at once; a change made during a save goes out after it", async () => {
    let finish: (ok: boolean) => void = () => {};
    const save = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { rerender, result } = setup(save);
    await pass(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saving");

    rerender({ watch: 1, on: true });
    await pass(DELAY * 2);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => finish(true));
    expect(result.current.state).toBe("saved");
    await pass(DELAY);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a failed save and tries again later", async () => {
    const save = vi.fn(async () => false);
    const { result } = setup(save);
    await pass(DELAY);
    expect(result.current.state).toBe("error");
    expect(save).toHaveBeenCalledTimes(1);
    await pass(RETRY - 100);
    expect(save).toHaveBeenCalledTimes(1);
    await pass(200);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush saves at once and says whether it worked", async () => {
    const save = vi.fn(async () => true);
    const { result, form } = setup(save);
    save.mockImplementation(async () => {
      form.dirty = false;
      return true;
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await pass(DELAY * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush reports a failure", async () => {
    const { result } = setup(vi.fn(async () => false));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(false);
  });

  it("flush with nothing to save succeeds without calling the server", async () => {
    const save = vi.fn(async () => true);
    const { result } = setup(save, { dirty: false });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("flush waits for a save already running, then sends what changed since", async () => {
    let finish: (ok: boolean) => void = () => {};
    const save = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { result } = setup(save);
    await pass(DELAY);
    let flushed: Promise<boolean> = Promise.resolve(false);
    act(() => {
      flushed = result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => finish(true));
    await expect(flushed).resolves.toBe(true);
  });
});
