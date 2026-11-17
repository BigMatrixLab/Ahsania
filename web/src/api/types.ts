export type Role = "doctor" | "admin";
export type Status = "processing" | "draft" | "pending_admin" | "approved";

export interface Me {
  id: number;
  name: string;
  username: string;
  role: Role;
}

export interface Account {
  id: number;
  name: string;
  username: string;
  role: Role;
  active: boolean;
}

export interface Option {
  value: string;
  synonyms: string[];
}

interface FieldBase {
  key: string;
  label?: string;
  hint?: string;
  required: boolean;
  source?: "dicom";
  /** Long forms group their fields under these headings. */
  section?: string;
  /** Ask this only when another answer at the same level is one of these. */
  show_if?: { key: string; values: (string | boolean)[] };
}
export type TextFieldDef = FieldBase & { type: "text" };
export type NumberFieldDef = FieldBase & { type: "number"; unit?: string; min?: number; max?: number };
export type DateFieldDef = FieldBase & { type: "date"; document_date?: boolean };
export type EnumFieldDef = FieldBase & { type: "enum"; options: Option[] };
export type BooleanFieldDef = FieldBase & { type: "boolean" };
export type GroupFieldDef = FieldBase & { type: "group"; repeat: boolean; fields: FieldDef[] };
export type FieldDef = TextFieldDef | NumberFieldDef | DateFieldDef | EnumFieldDef | BooleanFieldDef | GroupFieldDef;

export interface TemplateDef {
  key: string;
  version: number;
  phase: 1 | 2 | 3;
  /** A `form` is typed straight into the app, with no photo. */
  kind: "document" | "film_photo" | "dicom" | "form";
  title: string;
  /** Filled from the hospital system by RC number, and sent back on approval. */
  hospital?: boolean;
  /** A patient may have many of this form, one per visit. */
  repeats?: boolean;
  /** Old form: its records still open, but no new ones. */
  retired?: boolean;
  fields: FieldDef[];
}

export interface TemplateOut {
  key: string;
  version: number;
  phase: number;
  kind: TemplateDef["kind"];
  title: string;
  definition: TemplateDef;
  locked: boolean;
}

export interface FieldError {
  path: string;
  message: string;
}

export interface LastEvent {
  action: string;
  comment: string | null;
  actor_name: string;
  created_at: string;
}

export interface FieldChange {
  path: string;
  old: unknown;
  new: unknown;
}

export interface EventOut extends LastEvent {
  id: number;
  field_changes: FieldChange[] | null;
  field_flags: Record<string, string> | null;
}

export interface FileOut {
  id: string;
  kind: "page" | "dicom";
  page_no: number | null;
  size: number;
}

export type AiColour = "green" | "amber" | "red" | "grey";

/** Where a value was read on a page: box = [x0, y0, x1, y1] in the stored page's pixels. */
export interface SourceBox {
  page: number;
  box: [number, number, number, number];
}

/** The AI's result for one field. `value` is what the AI filled in. */
export interface AiField {
  colour: AiColour;
  confidence: number | null;
  sources: SourceBox[];
  edited: boolean;
  value: unknown;
}

export interface Extraction {
  model: string;
  fields: Record<string, AiField>;
}

export interface RecordSummary {
  id: string;
  reg_no: string;
  template_key: string;
  template_title: string;
  template_version: number;
  status: Status;
  extraction_status: string;
  document_date: string | null;
  created_by_id: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  last_event: LastEvent | null;
  /** AI fields still holding an amber / red value (the queue's 🟡/🔴 counts). */
  ai_amber: number;
  ai_red: number;
  /** Sent to the admin at least once; such a record can no longer be deleted. */
  sent_to_admin: boolean;
}

export interface RecordDetail extends RecordSummary {
  values: Record<string, unknown>;
  extraction: Extraction | null;
  extraction_queued_at: string | null;
  row_version: number;
  files: FileOut[];
  events: EventOut[];
  template: TemplateOut;
  errors: FieldError[];
  duplicate_of: string[];
}

/** One scan of a patient; a report and a film of one date count as one study. */
export interface Study {
  date: string;
  image: boolean;
  report: boolean;
  days_after_baseline: number | null;
}

export interface PatientSummary {
  reg_no: string;
  record_count: number;
  approved_count: number;
  baseline: Study | null;
  xrays: Study[];
  paired: boolean;
  /** Who the patient is, from their first-visit form. */
  profile: Record<string, unknown> | null;
}

export interface PatientDetail extends PatientSummary {
  records: RecordSummary[];
}

