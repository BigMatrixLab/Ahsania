// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HospitalSync as Sync, RecordDetail } from "../api/types";
import { ApproveChanges, HospitalSync } from "./HospitalSync";

function record(sync: Sync | null): RecordDetail {
  return { id: "r1", row_version: 7, hospital_sync: sync, template: { definition: { fields: [{ key: "age_years", label: "Age at diagnosis", type: "number" }] } } } as unknown as RecordDetail;
}

function sync(status: Sync["status"], extra: Partial<Sync> = {}): Sync {
  return { status, at: "2026-11-17T10:00:00+00:00", sent: [], conflicts: [], error: null, ...extra };
}

const CONFLICT = sync("conflict", { conflicts: [{ key: "age_years", hospital_value: 61, ours: 58, imported: 56 }] });

function reply(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HospitalSync", () => {
  it.each([
    [null, "Not sent to the hospital yet"],
    [sync("sent"), "Sent to hospital"],
    [sync("nothing_to_send"), "Nothing new for the hospital"],
    [sync("unavailable"), "Hospital not reachable"],
    [sync("not_at_hospital"), "Not at hospital"],
    [CONFLICT, "Conflict"],
  ] as const)("says %o", (value, text) => {
    render(<HospitalSync record={record(value)} canAct={false} onDone={() => {}} />);
    expect(screen.getByText(new RegExp(text))).toBeTruthy();
  });

  it("lists each conflict with all three values", () => {
    render(<HospitalSync record={record(CONFLICT)} canAct onDone={() => {}} />);
    expect(screen.getByText("Age at diagnosis: hospital now has 61; we had 56; you approved 58")).toBeTruthy();
  });

  it("an admin keeps the hospital's value or ours", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => reply({ id: "r1" }));
    vi.stubGlobal("fetch", spy);
    const onDone = vi.fn();
    render(<HospitalSync record={record(CONFLICT)} canAct onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Keep hospital's" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep ours" }));
    const bodies = spy.mock.calls.map(([url, init]) => [url, JSON.parse(String(init!.body))]);
    expect(bodies).toEqual([
      ["/api/records/r1/hospital-conflict", { key: "age_years", keep: "hospital", row_version: 7 }],
      ["/api/records/r1/hospital-conflict", { key: "age_years", keep: "ours", row_version: 7 }],
    ]);
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it("Try again posts to hospital-sync", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => reply({ id: "r1" }));
    vi.stubGlobal("fetch", spy);
    render(<HospitalSync record={record(sync("unavailable"))} canAct onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(spy.mock.calls[0][0]).toBe("/api/records/r1/hospital-sync");
  });

  it("doctors see no buttons", () => {
    render(<HospitalSync record={record(CONFLICT)} canAct={false} onDone={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ApproveChanges", () => {
  it("lists old and new values before sending", async () => {
    const onConfirm = vi.fn();
    render(
      <ApproveChanges
        corrections={[{ key: "age_years", label: "Age at diagnosis", from: 56, to: 58 }]}
        newCount={3}
        confirmLabel="Yes, approve"
        busy={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Age at diagnosis: 56 → 58")).toBeTruthy();
    expect(screen.getByText(/3 new values/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Yes, approve" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
