import { AlertTriangle, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AiColour, AiField, Extraction, FieldDef, FileOut, SourceBox } from "../api/types";
import { useHtmlImage } from "../imaging/useHtmlImage";
import { card, inputClass, quietButton, secondaryButton } from "../ui/styles";
import { dateLabel } from "../ui/time";
import { AI_LABEL, aiMarker } from "./aiMarkers";
import { getIn, humanize, isEmptyValue, pathToString, setIn, type PathPart } from "./fieldPaths";
import { hospitalNote } from "./hospital";

interface Props {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
  flags?: Record<string, string>;
  /** Results of reading the photo: fields still holding what was read get a marker. */
  extraction?: Extraction | null;
  /** Called when a field gets focus or is tapped, with its reading result (null when it has none). */
  onFieldFocus?: (path: string, ai: AiField | null) => void;
  /** Show the "needed" messages: off until the doctor has tried to send the form. */
  showRequired?: boolean;
  /** The record's pages, for showing where a value was read. */
  pages?: FileOut[];
  /** What the hospital system held when the record was imported: those fields get a tag, and a change a warning. */
  hospital?: Record<string, unknown> | null;
}

interface Context {
  values: Record<string, unknown>;
  set: (parts: PathPart[], value: unknown) => void;
  errors: Record<string, string>;
  flags: Record<string, string>;
  readOnly: boolean;
  extraction: Extraction | null;
  showRequired: boolean;
  pages: FileOut[];
  hospital: Record<string, unknown> | null;
  active: string | null;
  touch: (path: string, ai: AiField | null) => void;
}

export function FormRenderer({ fields, values, onChange, errors, readOnly, flags = {}, extraction = null, onFieldFocus, showRequired = false, pages = [], hospital = null }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const ctx: Context = {
    values,
    set: (parts, value) => onChange(setIn(values, parts, value)),
    errors,
    flags,
    readOnly,
    extraction,
    showRequired,
    pages,
    hospital,
    active,
    touch: (path, ai) => {
      setActive(path);
      onFieldFocus?.(path, ai);
    },
  };
  const groups = groupBySection(fields);
  if (readOnly) {
    return (
      <div className="space-y-3">
        {groups.map((group, i) => (
          <ReadOnlyBlock key={group.name ?? i} name={group.name} fields={group.fields} ctx={ctx} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {groups.map((group, i) =>
        group.name ? (
          <Section key={group.name} name={group.name} fields={group.fields} ctx={ctx} startOpen={i === 0 && !allFromHospital(group.fields, ctx)} />
        ) : (
          <div key={i} className="space-y-4">
            {group.fields.map((field) => (
              <FieldView key={field.key} field={field} parts={[field.key]} ctx={ctx} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function groupBySection(fields: FieldDef[]): { name: string | null; fields: FieldDef[] }[] {
  const groups: { name: string | null; fields: FieldDef[] }[] = [];
  for (const field of fields) {
    const name = field.section ?? null;
    const last = groups.at(-1);
    if (last && last.name === name) last.fields.push(field);
    else groups.push({ name, fields: [field] });
  }
  return groups;
}

/** A conditional question shows while its answer calls for it, and also whenever it already holds a value: nothing is kept out of sight. */
function isShown(field: FieldDef, siblings: unknown): boolean {
  if (!field.show_if) return true;
  const answer = getIn(siblings, [field.show_if.key]);
  return field.show_if.values.includes(answer as string | boolean) || !isEmptyValue(getIn(siblings, [field.key]));
}

const labelOf = (field: FieldDef) => field.label ?? humanize(field.key);

function errorFor(ctx: Context, path: string): string | undefined {
  const error = ctx.errors[path];
  if (error !== "required") return error;
  return ctx.showRequired ? "Needed before sending" : undefined;
}

function Section({ name, fields, ctx, startOpen }: { name: string; fields: FieldDef[]; ctx: Context; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const shown = fields.filter((f) => isShown(f, ctx.values));
  const empty = (f: FieldDef) => isEmptyValue(ctx.values[f.key]);
  const answered = shown.filter((f) => !empty(f)).length;
  const needed = shown.filter((f) => f.required && empty(f)).length;
  const problems = shown.filter((f) => errorFor(ctx, f.key)).length;

  useEffect(() => {
    if (problems > 0) setOpen(true);
  }, [problems]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-2 rounded-2xl px-4 py-3 text-left">
        <span className="flex-1 font-semibold text-slate-800">{name}</span>
        {needed > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{needed} needed</span>}
        <span className="text-sm tabular-nums text-slate-600">
          {answered} of {shown.length}
        </span>
        <ChevronDown aria-hidden="true" className={`size-5 shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div hidden={!open} className="grid gap-x-6 gap-y-4 border-t border-slate-100 p-4 sm:grid-cols-2">
        {fields.map((field) => (
          <FieldView key={field.key} field={field} parts={[field.key]} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}

const SHELL: Partial<Record<AiColour, string>> = {
  amber: "-mx-2 rounded-xl bg-amber-50 p-2 ring-1 ring-amber-300",
  red: "-mx-2 rounded-xl bg-red-50 p-2 ring-1 ring-red-300",
};

function AiTag({ colour }: { colour: AiColour }) {
  if (colour === "green") {
    return (
      <span title={AI_LABEL.green} className="text-teal-700">
        <Check aria-hidden="true" className="size-4" />
        <span className="sr-only">{AI_LABEL.green}</span>
      </span>
    );
  }
  if (colour === "grey") return null;
  const tone = colour === "amber" ? "text-amber-800" : "text-red-700";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      {AI_LABEL[colour]}
    </span>
  );
}

/** The part of the photo a value was read from, shown right under the field: on a phone the full page is out of view. */
function SourceSnippet({ file, box }: { file: FileOut; box: SourceBox["box"] }) {
  const url = `/api/files/${file.id}`;
  const { image } = useHtmlImage(url);
  if (!image) return null;
  const pad = 14;
  const x0 = Math.max(0, box[0] - pad);
  const y0 = Math.max(0, box[1] - pad);
  const width = Math.min(image.naturalWidth, box[2] + pad) - x0;
  const height = Math.min(image.naturalHeight, box[3] + pad) - y0;
  return (
    <div data-testid="source-snippet" className="mt-2 w-full overflow-hidden rounded-lg border border-teal-300 bg-white" style={{ maxWidth: width }}>
      <div className="relative w-full" style={{ aspectRatio: `${width} / ${height}` }}>
        <img
          src={url}
          alt="Where this was read on the page"
          className="absolute max-w-none"
          style={{ width: `${(image.naturalWidth / width) * 100}%`, left: `${-(x0 / width) * 100}%`, top: `${-(y0 / height) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Snippet({ ctx, path, ai }: { ctx: Context; path: string; ai: AiField | null }) {
  const source = ai?.sources[0];
  const file = source && ctx.pages.filter((f) => f.kind === "page")[source.page - 1];
  if (ctx.active !== path || !source || !file) return null;
  return <SourceSnippet file={file} box={source.box} />;
}

/** Nothing left to check in this section: every field holds the hospital's own value. */
function allFromHospital(fields: FieldDef[], ctx: Context): boolean {
  return ctx.hospital !== null && fields.every((f) => hospitalNote(ctx.hospital, f.key, ctx.values[f.key])?.kind === "from");
}

function HospitalNote({ ctx, path }: { ctx: Context; path: string }) {
  const note = hospitalNote(ctx.hospital, path, ctx.values[path]);
  if (!note) return null;
  if (note.kind === "from") {
    return <p className="mt-1 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200">From hospital</p>;
  }
  return (
    <p className="mt-1 flex gap-1 text-sm text-amber-800">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {note.text}
    </p>
  );
}

function Notes({ field, ctx, path, error, value }: { field: FieldDef; ctx: Context; path: string; error?: string; value?: unknown }) {
  const flag = ctx.flags[path];
  return (
    <>
      <HospitalNote ctx={ctx} path={path} />
      {field.type === "date" && typeof value === "string" && value && <p className="mt-1 text-xs text-slate-600">{dateLabel(value)}</p>}
      {field.hint && <p className="mt-1 text-xs text-slate-600">{field.hint}</p>}
      {flag && <p className="mt-1 text-sm text-amber-800">Reviewer: {flag}</p>}
      {error && <p className="mt-1 text-sm font-medium text-red-700">{error}</p>}
    </>
  );
}

function FieldView({ field, parts, ctx }: { field: FieldDef; parts: PathPart[]; ctx: Context }) {
  const path = pathToString(parts);
  const value = getIn(ctx.values, parts);
  if (!isShown(field, getIn(ctx.values, parts.slice(0, -1)))) return null;
  if (field.type === "group") return <GroupView field={field} parts={parts} value={value} ctx={ctx} />;
  if (ctx.readOnly || field.source === "dicom") return <ReadOnlyField field={field} parts={parts} ctx={ctx} />;

  const id = `f-${path}`;
  const labelId = `${id}-label`;
  const error = errorFor(ctx, path);
  const inputCls = `${inputClass} ${error ? "border-red-500" : ""}`;
  const set = (v: unknown) => ctx.set(parts, v);
  const ai = aiMarker(ctx.extraction, path, value);
  const touch = () => ctx.touch(path, ai);
  const stars = field.required ? <span aria-hidden="true" className="text-red-700"> *</span> : null;
  const shell = (children: ReactNode, wide = false) => (
    <div data-ai={ai?.colour} data-field={path} onFocus={touch} onClick={touch} className={`${wide ? "sm:col-span-2" : ""} ${ai ? (SHELL[ai.colour] ?? "") : ""}`}>
      {children}
      <Snippet ctx={ctx} path={path} ai={ai} />
    </div>
  );

  if (field.type === "boolean") {
    return shell(
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-slate-800">
            <span id={labelId}>
              {labelOf(field)}
              {stars}
            </span>
            {ai && <AiTag colour={ai.colour} />}
          </span>
          <Choice
            name={id}
            labelledBy={labelId}
            options={[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ]}
            value={value}
            invalid={!!error}
            inline
            onPick={set}
          />
        </div>
        <Notes field={field} ctx={ctx} path={path} error={error} />
      </>,
    );
  }

  if (field.type === "enum" && fitsAsChoices(field.options.map((o) => o.value))) {
    return shell(
      <>
        <div className="flex items-center gap-1.5">
          <span id={labelId} className="text-sm font-medium text-slate-800">
            {labelOf(field)}
            {stars}
          </span>
          {ai && <AiTag colour={ai.colour} />}
        </div>
        <div className="mt-1.5">
          <Choice name={id} labelledBy={labelId} options={field.options.map((o) => ({ value: o.value, label: o.value }))} value={value} invalid={!!error} onPick={set} />
        </div>
        <Notes field={field} ctx={ctx} path={path} error={error} />
      </>,
      true,
    );
  }

  return shell(
    <>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {labelOf(field)}
          {stars}
        </label>
        {ai && <AiTag colour={ai.colour} />}
      </div>
      {field.type === "text" && (
        <textarea id={id} rows={2} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value === "" ? null : e.target.value)} className={inputCls} />
      )}
      {field.type === "number" && <NumberInput id={id} value={value} unit={field.unit} onChange={set} className={inputCls} />}
      {field.type === "date" && <input id={id} type="date" value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || null)} className={inputCls} />}
      {field.type === "enum" && (
        <select id={id} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || null)} className={inputCls}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value}
            </option>
          ))}
        </select>
      )}
      <Notes field={field} ctx={ctx} path={path} error={error} value={value} />
    </>,
    field.type === "text",
  );
}

/** A short list reads and answers faster as buttons than behind a dropdown. */
function fitsAsChoices(options: string[]): boolean {
  return options.length <= 5 && options.join("").length <= 30;
}

function Choice({
  name,
  labelledBy,
  options,
  value,
  invalid,
  inline = false,
  onPick,
}: {
  name: string;
  labelledBy: string;
  options: { value: string | boolean; label: string }[];
  value: unknown;
  invalid: boolean;
  /** Stay on one line beside the label, whatever the label's length. */
  inline?: boolean;
  onPick: (value: unknown) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={`flex gap-1.5 ${inline ? "shrink-0" : "flex-wrap"}`}>
      {options.map((option) => {
        const selected = value === option.value;
        const tone = selected ? "border-teal-700 bg-teal-700 text-white" : `bg-white text-slate-800 hover:bg-teal-50 ${invalid ? "border-red-500" : "border-slate-300"}`;
        return (
          <label
            key={option.label}
            className={`relative inline-flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-teal-600 ${tone}`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={selected}
              onChange={() => onPick(option.value)}
              onClick={() => {
                if (selected) onPick(null); // a second tap takes the answer back
              }}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

function GroupView({ field, parts, value, ctx }: { field: Extract<FieldDef, { type: "group" }>; parts: PathPart[]; value: unknown; ctx: Context }) {
  const label = labelOf(field);
  const error = errorFor(ctx, pathToString(parts));
  if (!field.repeat) {
    return (
      <fieldset className={`${card} space-y-3 sm:col-span-2`}>
        <legend className="px-1 font-medium">{label}</legend>
        {field.fields.map((sub) => (
          <FieldView key={sub.key} field={sub} parts={[...parts, sub.key]} ctx={ctx} />
        ))}
      </fieldset>
    );
  }
  const items = Array.isArray(value) ? value : [];
  return (
    <fieldset className="space-y-3 sm:col-span-2">
      <legend className="font-medium text-slate-800">
        {label} ({items.length})
      </legend>
      {items.map((_, i) => (
        <div key={i} className={`${card} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-800">
              {label} {i + 1}
            </span>
            <button type="button" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => ctx.set(parts, items.filter((__, j) => j !== i))} className={quietButton}>
              <Trash2 aria-hidden="true" className="size-4" />
              Remove
            </button>
          </div>
          {field.fields.map((sub) => (
            <FieldView key={sub.key} field={sub} parts={[...parts, i, sub.key]} ctx={ctx} />
          ))}
        </div>
      ))}
      <button type="button" onClick={() => ctx.set(parts, [...items, {}])} className={secondaryButton}>
        <Plus aria-hidden="true" className="size-4" />
        Add {label.toLowerCase()}
      </button>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </fieldset>
  );
}

function ReadOnlyBlock({ name, fields, ctx }: { name: string | null; fields: FieldDef[]; ctx: Context }) {
  const shown = fields.filter((f) => isShown(f, ctx.values));
  const filled = shown.filter((f) => !isEmptyValue(ctx.values[f.key]));
  const blank = shown.filter((f) => isEmptyValue(ctx.values[f.key])).map(labelOf);
  return (
    <section className={card}>
      {name && <h2 className="mb-3 font-semibold text-slate-800">{name}</h2>}
      {filled.length > 0 && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {filled.map((field) => (
            <ReadOnlyField key={field.key} field={field} parts={[field.key]} ctx={ctx} />
          ))}
        </dl>
      )}
      {blank.length > 0 && <p className={`text-sm text-slate-600 ${filled.length > 0 ? "mt-3" : ""}`}>Not recorded: {blank.join(", ")}</p>}
    </section>
  );
}

function formatted(field: FieldDef, value: unknown): string {
  if (field.type === "boolean" && typeof value === "boolean") return value ? "Yes" : "No";
  if (field.type === "date" && typeof value === "string") return dateLabel(value);
  if (field.type === "number" && field.unit) return `${String(value)} ${field.unit}`;
  return String(value);
}

function ReadOnlyField({ field, parts, ctx }: { field: FieldDef; parts: PathPart[]; ctx: Context }) {
  const path = pathToString(parts);
  const value = getIn(ctx.values, parts);
  if (field.type === "group") {
    const items = field.repeat ? (Array.isArray(value) ? value : []) : [value];
    return (
      <div className="space-y-2 sm:col-span-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">
              {labelOf(field)}
              {field.repeat ? ` ${i + 1}` : ""}
            </p>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {field.fields
                .filter((sub) => !isEmptyValue(getIn(item, [sub.key])))
                .map((sub) => (
                  <ReadOnlyField key={sub.key} field={sub} parts={field.repeat ? [...parts, i, sub.key] : [...parts, sub.key]} ctx={ctx} />
                ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  const ai = aiMarker(ctx.extraction, path, value);
  const flag = ctx.flags[path];
  return (
    <div data-ai={ai?.colour} data-field={path} className={field.type === "text" ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-slate-600">{labelOf(field)}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-900">
        <span className="whitespace-pre-wrap">{isEmptyValue(value) ? "—" : formatted(field, value)}</span>
        {ai && <AiTag colour={ai.colour} />}
        {(ai?.sources.length ?? 0) > 0 && (
          <button type="button" onClick={() => ctx.touch(path, ai)} className="text-xs font-medium text-teal-800 underline underline-offset-2">
            See on the page
          </button>
        )}
      </dd>
      <Snippet ctx={ctx} path={path} ai={ai} />
      {flag && <p className="mt-1 text-sm text-amber-800">Reviewer: {flag}</p>}
    </div>
  );
}

const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)$/;

/** "" -> null, plain decimal text -> number, anything else stays text so the server can flag it. */
function parseNumber(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return DECIMAL.test(trimmed) ? Number(trimmed) : text;
}

function display(value: unknown): string {
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

function NumberInput({ id, value, unit, onChange, className }: { id: string; value: unknown; unit?: string; onChange: (v: unknown) => void; className: string }) {
  const [text, setText] = useState(display(value));
  useEffect(() => {
    // Only resync when the stored value changed from outside (e.g. a reload), never while typing "2." -> 2.
    if (parseNumber(text) !== value && !(value === undefined && text === "")) setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNumber(e.target.value));
        }}
        className={`${className} tabular-nums ${unit ? "pr-16" : ""}`}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-600">{unit}</span>}
    </div>
  );
}
