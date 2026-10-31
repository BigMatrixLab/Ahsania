import { describe, expect, it } from "vitest";
import { isEmptyValue, labelOfPath, sameValues } from "./fieldPaths";
import type { FieldDef } from "../api/types";

describe("sameValues", () => {
  it("ignores key order, because the database does not keep it", () => {
    expect(sameValues({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } }, { b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 })).toBe(true);
  });
  it("sees a changed, added or removed value", () => {
    expect(sameValues({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValues({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValues({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
  it("keeps null apart from a missing value, so clearing a field is saved", () => {
    expect(sameValues({ a: null }, {})).toBe(false);
  });
});

describe("isEmptyValue", () => {
  it.each([[null], [undefined], [""], ["  "], [[]]])("%j is empty", (value) => {
    expect(isEmptyValue(value)).toBe(true);
  });
  it.each([[0], [false], ["x"], [[{}]]])("%j is an answer", (value) => {
    expect(isEmptyValue(value)).toBe(false);
  });
});

describe("labelOfPath", () => {
  const fields: FieldDef[] = [
    { key: "age_years", label: "Age", type: "number", required: true },
    { key: "pack_years", type: "number", required: false },
    {
      key: "lesions",
      label: "Lesion",
      type: "group",
      repeat: true,
      required: false,
      fields: [{ key: "lobe", label: "Lobe", type: "text", required: false }],
    },
  ];
  it("finds the label a doctor sees", () => {
    expect(labelOfPath(fields, "age_years")).toBe("Age");
    expect(labelOfPath(fields, "pack_years")).toBe("Pack years");
    expect(labelOfPath(fields, "lesions[1].lobe")).toBe("Lesion 2: Lobe");
  });
  it("falls back to the path for something unknown", () => {
    expect(labelOfPath(fields, "other")).toBe("Other");
  });
});
import { getIn, humanize, pathToString, setIn } from "./fieldPaths";

describe("field paths", () => {
  it("formats paths like the server", () => {
    expect(pathToString(["lesions", 0, "long_axis_cm"])).toBe("lesions[0].long_axis_cm");
    expect(pathToString(["modality"])).toBe("modality");
  });
  it("reads nested values", () => {
    expect(getIn({ lesions: [{ lobe: "RUL" }] }, ["lesions", 0, "lobe"])).toBe("RUL");
    expect(getIn({}, ["lesions", 0, "lobe"])).toBeUndefined();
  });
  it("writes nested values without mutating the original", () => {
    const original = { modality: "CT", lesions: [{ lobe: "RUL" }] };
    const next = setIn(original, ["lesions", 1, "lobe"], "LUL");
    expect(next).toEqual({ modality: "CT", lesions: [{ lobe: "RUL" }, { lobe: "LUL" }] });
    expect(original.lesions).toHaveLength(1);
  });
  it("humanizes keys", () => {
    expect(humanize("long_axis_cm")).toBe("Long axis cm");
  });
});
