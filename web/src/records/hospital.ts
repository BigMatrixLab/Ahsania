import type { FieldDef } from "../api/types";
import { humanize, isEmptyValue } from "./fieldPaths";

/** Same rules as the server's changes_for_hospital: blanks never go; a hospital value that differs is a correction. */
export function hospitalChanges(
  snapshot: Record<string, unknown> | null,
  values: Record<string, unknown>,
  fields: FieldDef[],
): { corrections: { key: string; label: string; from: unknown; to: unknown }[]; newCount: number; cleared: string[] } {
  const corrections: { key: string; label: string; from: unknown; to: unknown }[] = [];
  const cleared: string[] = [];
  let newCount = 0;
  for (const field of fields) {
    const value = values[field.key];
    const old = snapshot?.[field.key];
    const hadValue = old !== null && old !== undefined;
    if (isEmptyValue(value)) {
      if (hadValue) cleared.push(field.key);
    } else if (!hadValue) {
      newCount += 1;
    } else if (old !== value) {
      corrections.push({ key: field.key, label: field.label ?? humanize(field.key), from: old, to: value });
    }
  }
  return { corrections, newCount, cleared };
}

export function shown(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

/** What to say under one field about the hospital's value, or null when the hospital had none. */
export function hospitalNote(
  snapshot: Record<string, unknown> | null | undefined,
  key: string,
  value: unknown,
): { kind: "from" } | { kind: "changed" | "cleared"; text: string } | null {
  const old = snapshot?.[key];
  if (old === null || old === undefined) return null;
  if (isEmptyValue(value)) return { kind: "cleared", text: `Hospital has ${shown(old)}. A blank is not sent; the hospital keeps its value.` };
  if (old === value) return { kind: "from" };
  return { kind: "changed", text: `Hospital has ${shown(old)}. If you and an admin approve, the hospital's value will be changed to ${shown(value)}.` };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Fill BMI and pack-years from their inputs when they are still empty; a value already there is never replaced. */
export function withDerived(values: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  const { weight_kg: kg, height_cm: cm, sticks_per_day: sticks, smoking_years: years } = values;
  if (isEmptyValue(values.bmi) && isNumber(kg) && isNumber(cm) && cm > 0) extra.bmi = round1(kg / (cm / 100) ** 2);
  if (isEmptyValue(values.pack_years) && isNumber(sticks) && isNumber(years)) extra.pack_years = round1((sticks / 20) * years);
  return Object.keys(extra).length ? { ...values, ...extra } : values;
}
