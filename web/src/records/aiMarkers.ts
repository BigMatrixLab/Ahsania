import type { AiColour, AiField, Extraction } from "../api/types";
import { isEmptyValue } from "./fieldPaths";

/** What each colour tells the person checking the form. */
export const AI_LABEL: Record<AiColour, string> = {
  green: "Read from the page",
  amber: "Please check",
  red: "Does not fit the form",
  grey: "Not on the page",
};

/** The result of reading the photo for a field, as long as the field still holds what was read. */
export function aiMarker(extraction: Extraction | null | undefined, path: string, current: unknown): AiField | null {
  const field = extraction?.fields[path];
  if (!field || field.edited) return null;
  if ("value" in field && !(isEmptyValue(field.value) ? isEmptyValue(current) : field.value === current)) return null;
  return field;
}
