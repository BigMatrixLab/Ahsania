import { describe, expect, it } from "vitest";
import type { RecordDetail } from "./types";
import { needsPolling } from "./hooks";

function record(status: string, hospital: boolean, sync: unknown = null): RecordDetail {
  return { status, hospital_sync: sync, template: { definition: { hospital } } } as unknown as RecordDetail;
}

describe("needsPolling", () => {
  it("polls while the document is being read", () => {
    expect(needsPolling(record("processing", false))).toBe(true);
  });

  it("polls an approved hospital record until the hospital's answer is in", () => {
    expect(needsPolling(record("approved", true))).toBe(true);
    expect(needsPolling(record("approved", true, { status: "sent" }))).toBe(false);
  });

  it("does not poll other records", () => {
    expect(needsPolling(record("approved", false))).toBe(false);
    expect(needsPolling(record("draft", true))).toBe(false);
    expect(needsPolling(undefined)).toBe(false);
  });
});
