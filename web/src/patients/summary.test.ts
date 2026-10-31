import { describe, expect, it } from "vitest";
import type { PatientSummary, Study } from "../api/types";
import { pairStatus, profileLine } from "./summary";

const study = (image: boolean, report = false): Study => ({ date: "2026-01-10", image, report, days_after_baseline: 0 });

function patient(extra: Partial<PatientSummary>): PatientSummary {
  return { reg_no: "RC1", record_count: 1, approved_count: 1, baseline: null, xrays: [], paired: false, profile: null, ...extra };
}

describe("pairStatus", () => {
  it.each<[string, Partial<PatientSummary>, string, boolean]>([
    ["both images", { baseline: study(true), xrays: [study(true)], paired: true }, "Paired", true],
    ["nothing approved", {}, "No approved scans yet", false],
    ["only an X-ray", { xrays: [study(true)] }, "Needs CT or MRI", false],
    ["only a CT film", { baseline: study(true) }, "Needs follow-up X-ray", false],
    ["only a CT report", { baseline: study(false, true) }, "CT/MRI report only, needs the image", false],
    ["CT report and X-ray film", { baseline: study(false, true), xrays: [study(true)] }, "CT/MRI report only, needs the image", false],
    ["CT film and X-ray report", { baseline: study(true), xrays: [study(false, true)] }, "X-ray report only, needs the image", false],
  ])("%s", (_, extra, label, done) => {
    expect(pairStatus(patient(extra))).toEqual({ label, done });
  });
});

describe("profileLine", () => {
  it("reads like a clinician's one-line summary", () => {
    const profile = { age_years: 62, sex: "male", smoking_status: "current", pack_years: 30, histology: "adenocarcinoma", stage_group: "IIIA" };
    expect(profileLine(profile)).toBe("62 y · male · current smoker, 30 pack-years · adenocarcinoma · stage IIIA");
  });

  it("uses plain words for a non-smoker and leaves out what is unknown", () => {
    expect(profileLine({ sex: "female", smoking_status: "never" })).toBe("female · never smoked");
    expect(profileLine({ age_years: 40, smoking_status: "unknown" })).toBe("40 y");
  });

  it("leaves out placeholder histology and tells apart a former smoker", () => {
    expect(profileLine({ smoking_status: "former", histology: "not yet known" })).toBe("former smoker");
  });

  it("is empty with no first-visit form", () => {
    expect(profileLine(null)).toBe("");
  });
});
