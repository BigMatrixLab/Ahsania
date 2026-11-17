import { describe, expect, it } from "vitest";
import type { FieldDef } from "../api/types";
import { hospitalChanges, hospitalNote, withDerived } from "./hospital";

const FIELDS: FieldDef[] = [
  { key: "age_years", label: "Age at diagnosis", type: "number", required: false },
  { key: "sex", label: "Sex", type: "enum", required: false, options: [{ value: "male", synonyms: [] }, { value: "female", synonyms: [] }] },
  { key: "education", label: "Education", type: "text", required: false },
  { key: "notes", type: "text", required: false },
];

describe("hospitalChanges", () => {
  it("counts new values, lists corrections and cleared values", () => {
    const snapshot = { age_years: 56, sex: "male", notes: "x" };
    const values = { age_years: 58, sex: "male", education: "primary", notes: "" };
    expect(hospitalChanges(snapshot, values, FIELDS)).toEqual({
      corrections: [{ key: "age_years", label: "Age at diagnosis", from: 56, to: 58 }],
      newCount: 1,
      cleared: ["notes"],
    });
  });

  it("treats every filled value of a hand-typed record as new", () => {
    expect(hospitalChanges(null, { age_years: 60, sex: null }, FIELDS)).toEqual({ corrections: [], newCount: 1, cleared: [] });
  });

  it("finds nothing when nothing changed", () => {
    expect(hospitalChanges({ sex: "male" }, { sex: "male" }, FIELDS)).toEqual({ corrections: [], newCount: 0, cleared: [] });
  });
});

describe("hospitalNote", () => {
  it("tags an unchanged hospital value", () => {
    expect(hospitalNote({ sex: "male" }, "sex", "male")).toEqual({ kind: "from" });
  });

  it("warns with both values when a hospital value is changed", () => {
    expect(hospitalNote({ age_years: 56 }, "age_years", 58)).toEqual({
      kind: "changed",
      text: "Hospital has 56. If you and an admin approve, the hospital's value will be changed to 58.",
    });
  });

  it("warns that a cleared hospital value is kept by the hospital", () => {
    expect(hospitalNote({ age_years: 56 }, "age_years", null)).toEqual({
      kind: "cleared",
      text: "Hospital has 56. A blank is not sent; the hospital keeps its value.",
    });
  });

  it("says nothing for a field the hospital lacked, or a hand-typed record", () => {
    expect(hospitalNote({ sex: "male" }, "age_years", 58)).toBeNull();
    expect(hospitalNote(null, "age_years", 58)).toBeNull();
  });

  it("shows yes/no for booleans", () => {
    const note = hospitalNote({ past_tb: true }, "past_tb", false);
    expect(note && "text" in note ? note.text : null).toBe(
      "Hospital has Yes. If you and an admin approve, the hospital's value will be changed to No.",
    );
  });
});

describe("withDerived", () => {
  it("fills BMI from weight and height", () => {
    expect(withDerived({ weight_kg: 70, height_cm: 170 }).bmi).toBe(24.2);
  });

  it("fills pack-years from sticks a day and years smoked", () => {
    expect(withDerived({ sticks_per_day: 10, smoking_years: 20 }).pack_years).toBe(10);
  });

  it("never overwrites a filled value", () => {
    expect(withDerived({ weight_kg: 70, height_cm: 170, bmi: 30, sticks_per_day: 10, smoking_years: 20, pack_years: 5 })).toMatchObject({ bmi: 30, pack_years: 5 });
  });

  it("leaves the values alone when an input is missing", () => {
    const values = { weight_kg: 70 };
    expect(withDerived(values)).toBe(values);
  });
});
