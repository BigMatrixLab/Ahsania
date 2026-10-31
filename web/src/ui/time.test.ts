import { describe, expect, it } from "vitest";
import { ageLabel, dateLabel, dateTimeLabel } from "./time";

const now = new Date("2026-10-04T12:00:00Z");

describe("ageLabel", () => {
  it.each([
    ["2026-10-04T11:59:30Z", "just now"],
    ["2026-10-04T11:30:00Z", "30 min"],
    ["2026-10-04T07:00:00Z", "5 h"],
    ["2026-09-30T12:00:00Z", "4 d"],
  ])("%s -> %s", (iso, label) => {
    expect(ageLabel(iso, now)).toBe(label);
  });
});

describe("dateLabel", () => {
  it("writes a date so day and month cannot be confused", () => {
    expect(dateLabel("2026-09-01")).toBe("1 Sep 2026");
    expect(dateLabel("2026-12-25")).toBe("25 Dec 2026");
  });

  it.each(["not a date", "2026-13-01", ""])("leaves %j as it is", (text) => {
    expect(dateLabel(text)).toBe(text);
  });
});

describe("dateTimeLabel", () => {
  it("shows the local date and a 24-hour time", () => {
    expect(dateTimeLabel(new Date(2026, 10, 1, 13, 5).toISOString())).toBe("1 Nov 2026, 13:05");
    expect(dateTimeLabel(new Date(2026, 0, 9, 7, 0).toISOString())).toBe("9 Jan 2026, 07:00");
  });
});
