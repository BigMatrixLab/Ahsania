import type { FieldDef } from "../api/types";

export type PathPart = string | number;

/** ["lesions", 0, "lobe"] -> "lesions[0].lobe" (the server's error-path format). */
export function pathToString(parts: PathPart[]): string {
  return parts.reduce<string>((acc, part) => (typeof part === "number" ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part), "");
}

export function getIn(obj: unknown, parts: PathPart[]): unknown {
  return parts.reduce<unknown>((current, part) => (current == null ? undefined : (current as Record<PathPart, unknown>)[part]), obj);
}

export function setIn<T>(obj: T, parts: PathPart[], value: unknown): T {
  if (parts.length === 0) return value as T;
  const [head, ...rest] = parts;
  if (typeof head === "number") {
    const list = Array.isArray(obj) ? [...obj] : [];
    list[head] = setIn(list[head], rest, value);
    return list as T;
  }
  const record = obj && typeof obj === "object" && !Array.isArray(obj) ? { ...(obj as Record<string, unknown>) } : {};
  record[head] = setIn(record[head], rest, value);
  return record as T;
}

export function humanize(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Mirrors the server's idea of an unanswered field: false and 0 are answers. */
export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const sorted = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return Object.fromEntries(sorted.map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/** Deep equality that ignores key order: the database does not keep the order the keys were sent in. */
export function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** The label a doctor sees for a server path: "lesions[1].lobe" -> "Lesion 2: Lobe". */
export function labelOfPath(fields: FieldDef[], path: string): string {
  const labels: string[] = [];
  let level = fields;
  for (const part of path.split(".")) {
    const match = /^(.+)\[(\d+)\]$/.exec(part);
    const key = match ? match[1] : part;
    const field = level.find((f) => f.key === key);
    const label = field?.label ?? humanize(key);
    labels.push(match ? `${label} ${Number(match[2]) + 1}` : label);
    level = field?.type === "group" ? field.fields : [];
  }
  return labels.join(": ");
}
