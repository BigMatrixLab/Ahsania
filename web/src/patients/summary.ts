import type { PatientSummary } from "../api/types";

export const NEW_PATIENT_FORM = "import_patient";

/** How far the patient is towards a CT/MRI and X-ray pair, in words that say what is still needed. */
export function pairStatus(patient: PatientSummary): { label: string; done: boolean } {
  const { baseline, xrays, paired } = patient;
  if (paired) return { label: "Paired", done: true };
  if (baseline && !baseline.image) return { label: "CT/MRI report only, needs the image", done: false };
  if (!baseline) return { label: xrays.length ? "Needs CT or MRI" : "No approved scans yet", done: false };
  if (xrays.length === 0) return { label: "Needs follow-up X-ray", done: false };
  return { label: "X-ray report only, needs the image", done: false };
}

function smoking(profile: Record<string, unknown>): string | null {
  const status = profile.smoking_status;
  if (status === "never") return "never smoked";
  if (status !== "former" && status !== "current") return null;
  return profile.pack_years != null ? `${status} smoker, ${profile.pack_years} pack-years` : `${status} smoker`;
}

/** "62 y · male · current smoker, 30 pack-years · adenocarcinoma · stage IIIA" */
export function profileLine(profile: Record<string, unknown> | null): string {
  if (!profile) return "";
  const histology = profile.histology === "not yet known" ? null : profile.histology;
  const parts = [
    profile.age_years != null ? `${profile.age_years} y` : null,
    profile.sex,
    smoking(profile),
    histology,
    profile.stage_group ? `stage ${profile.stage_group}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
