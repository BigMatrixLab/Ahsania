// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { AiField, Extraction, FieldDef } from "../api/types";
import { FormRenderer } from "./FormRenderer";

const FIELDS: FieldDef[] = [
  { key: "modality", label: "Modality", type: "enum", required: true, options: [{ value: "CT", synonyms: [] }, { value: "MRI", synonyms: [] }] },
  {
    key: "lesions",
    label: "Lesion",
    type: "group",
    repeat: true,
    required: false,
    fields: [{ key: "long_axis_cm", label: "Long axis", type: "number", unit: "cm", required: false }],
  },
];

const LONG_LIST: FieldDef = {
  key: "site",
  label: "Primary site",
  type: "enum",
  required: false,
  options: ["RUL", "RML", "RLL", "LUL", "LLL", "other"].map((value) => ({ value, synonyms: [] })),
};

const INTAKE: FieldDef[] = [
  { key: "age_years", label: "Age", type: "number", unit: "years", required: true, section: "Patient" },
  { key: "visit_date", label: "Visit", type: "date", required: true, section: "Patient" },
  { key: "symptom_cough", label: "Cough", type: "boolean", required: false, section: "Symptoms" },
  {
    key: "weight_lost_kg",
    label: "Weight lost",
    type: "number",
    unit: "kg",
    required: false,
    section: "Symptoms",
    show_if: { key: "symptom_cough", values: [true] },
  },
  { key: "smoking", label: "Smoking", type: "enum", required: true, section: "Tobacco", options: ["never", "current"].map((value) => ({ value, synonyms: [] })) },
];

function Harness({ fields = FIELDS, start = {}, onValues = () => {}, showRequired = false, errors = {} }: { fields?: FieldDef[]; start?: Record<string, unknown>; onValues?: (v: Record<string, unknown>) => void; showRequired?: boolean; errors?: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, unknown>>(start);
  return (
    <FormRenderer
      fields={fields}
      values={values}
      onChange={(v) => {
        setValues(v);
        onValues(v);
      }}
      errors={errors}
      readOnly={false}
      showRequired={showRequired}
    />
  );
}

afterEach(cleanup);

describe("FormRenderer", () => {
  it("adds a repeat-group item and keeps a trailing dot while typing", async () => {
    let latest: Record<string, unknown> = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    await userEvent.click(screen.getByRole("button", { name: "Add lesion" }));
    const input = screen.getByLabelText(/Long axis/) as HTMLInputElement;
    await userEvent.type(input, "2.");
    expect(input.value).toBe("2.");
    await userEvent.type(input, "3");
    expect(latest).toEqual({ lesions: [{ long_axis_cm: 2.3 }] });
  });

  it("passes text that is not a number on unchanged so the server can flag it", async () => {
    let latest: Record<string, unknown> = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    await userEvent.click(screen.getByRole("button", { name: "Add lesion" }));
    await userEvent.type(screen.getByLabelText(/Long axis/), "2,3");
    expect(latest).toEqual({ lesions: [{ long_axis_cm: "2,3" }] });
  });

  it("removes a repeat-group item", async () => {
    let latest: Record<string, unknown> = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    await userEvent.click(screen.getByRole("button", { name: "Add lesion" }));
    await userEvent.click(screen.getByRole("button", { name: "Add lesion" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove lesion 1" }));
    expect(latest).toEqual({ lesions: [{}] });
  });

  it("shows server errors and reviewer flags under the right field", () => {
    render(
      <FormRenderer
        fields={FIELDS}
        values={{ lesions: [{}] }}
        onChange={() => {}}
        errors={{ "lesions[0].long_axis_cm": "must be at most 20" }}
        flags={{ modality: "Check against page 1" }}
        readOnly={false}
      />,
    );
    expect(screen.getByText("must be at most 20")).toBeTruthy();
    expect(screen.getByText("Reviewer: Check against page 1")).toBeTruthy();
  });

  it.each(["Infinity", "0x10", "1e3"])("keeps %s as text so the server can flag it", async (typed) => {
    let latest: Record<string, unknown> = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    await userEvent.click(screen.getByRole("button", { name: "Add lesion" }));
    await userEvent.type(screen.getByLabelText(/Long axis/), typed);
    expect(latest).toEqual({ lesions: [{ long_axis_cm: typed }] });
  });
});

describe("one-tap answers", () => {
  it("answers a short list in one tap, and a second tap clears it", async () => {
    let latest: Record<string, unknown> = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    await userEvent.click(screen.getByRole("radio", { name: "CT" }));
    expect(latest).toEqual({ modality: "CT" });
    expect((screen.getByRole("radio", { name: "CT" }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "CT" }));
    expect(latest).toEqual({ modality: null });
  });

  it("keeps a dropdown for a long list, and stores null when it is cleared", async () => {
    let latest: Record<string, unknown> = {};
    render(<Harness fields={[LONG_LIST]} onValues={(v) => (latest = v)} />);
    await userEvent.selectOptions(screen.getByLabelText(/Primary site/), "RUL");
    expect(latest).toEqual({ site: "RUL" });
    await userEvent.selectOptions(screen.getByLabelText(/Primary site/), "");
    expect(latest).toEqual({ site: null });
  });

  it("answers yes or no in one tap, and tells a no apart from no answer", async () => {
    let latest: Record<string, unknown> = {};
    render(<Harness fields={[{ key: "cough", label: "Cough", type: "boolean", required: false }]} onValues={(v) => (latest = v)} />);
    const group = screen.getByRole("radiogroup", { name: "Cough" });
    await userEvent.click(within(group).getByRole("radio", { name: "No" }));
    expect(latest).toEqual({ cough: false });
    await userEvent.click(within(group).getByRole("radio", { name: "Yes" }));
    expect(latest).toEqual({ cough: true });
    await userEvent.click(within(group).getByRole("radio", { name: "Yes" }));
    expect(latest).toEqual({ cough: null });
  });
});

describe("a long form", () => {
  it("opens the first section, closes the rest, and counts the answers", () => {
    render(<Harness fields={INTAKE} start={{ age_years: 60 }} />);
    const patient = screen.getByRole("button", { name: /Patient/ });
    expect(patient.getAttribute("aria-expanded")).toBe("true");
    expect(within(patient).getByText("1 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Symptoms/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps what was typed when a section is closed and opened again", async () => {
    render(<Harness fields={INTAKE} />);
    const age = screen.getByLabelText(/Age/) as HTMLInputElement;
    await userEvent.type(age, "62");
    const header = screen.getByRole("button", { name: /Patient/ });
    await userEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(header);
    expect((screen.getByLabelText(/Age/) as HTMLInputElement).value).toBe("62");
  });

  it("shows a conditional question only when its answer calls for it", async () => {
    render(<Harness fields={INTAKE} />);
    expect(screen.queryByLabelText(/Weight lost/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Symptoms/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText(/Weight lost/)).toBeTruthy();
  });

  it("does not count a hidden question", () => {
    render(<Harness fields={INTAKE} />);
    expect(within(screen.getByRole("button", { name: /Symptoms/ })).getByText("0 of 1")).toBeTruthy();
  });

  it("keeps a conditional answer on screen, never silently kept or dropped, after the condition changes", () => {
    render(<Harness fields={INTAKE} start={{ symptom_cough: false, weight_lost_kg: 4 }} />);
    expect((screen.getByLabelText(/Weight lost/) as HTMLInputElement).value).toBe("4");
  });

  it("does not shout about required answers before the doctor tries to send", () => {
    render(<Harness fields={INTAKE} errors={{ age_years: "required" }} />);
    expect(screen.queryByText("Needed before sending")).toBeNull();
    expect(within(screen.getByRole("button", { name: /Patient/ })).getByText("2 needed")).toBeTruthy();
  });

  it("shows other mistakes straight away", () => {
    render(<Harness fields={INTAKE} start={{ age_years: 300 }} errors={{ age_years: "must be at most 120" }} />);
    expect(screen.getByText("must be at most 120")).toBeTruthy();
  });

  it("opens a closed section by itself when one of its answers is missing after trying to send", () => {
    render(<Harness fields={INTAKE} errors={{ smoking: "required" }} showRequired />);
    const tobacco = screen.getByRole("button", { name: /Tobacco/ });
    expect(tobacco.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Needed before sending")).toBeTruthy();
  });

  it("writes a date in words under the date box, so day and month cannot be mixed up", () => {
    render(<Harness fields={INTAKE} start={{ visit_date: "2026-09-01" }} />);
    expect(screen.getByText("1 Sep 2026")).toBeTruthy();
  });
});

describe("a read-only record", () => {
  it("reads like a chart: answers as text, with no boxes to type in", () => {
    render(
      <FormRenderer
        fields={INTAKE}
        values={{ age_years: 62, visit_date: "2026-09-01", symptom_cough: false, smoking: "current" }}
        onChange={() => {}}
        errors={{}}
        readOnly
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add lesion" })).toBeNull();
    expect(screen.getByText("62 years")).toBeTruthy();
    expect(screen.getByText("1 Sep 2026")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
    expect(screen.getByText("current")).toBeTruthy();
  });

  it("lists what was not recorded instead of showing empty boxes", () => {
    render(<FormRenderer fields={INTAKE} values={{ age_years: 62 }} onChange={() => {}} errors={{}} readOnly />);
    expect(screen.getByText("Not recorded: Visit")).toBeTruthy();
    expect(screen.getByText("Not recorded: Cough")).toBeTruthy();
  });

  it("shows repeating items as text", () => {
    render(<FormRenderer fields={FIELDS} values={{ lesions: [{ long_axis_cm: 2.3 }] }} onChange={() => {}} errors={{}} readOnly />);
    expect(screen.getByText("Lesion 1")).toBeTruthy();
    expect(screen.getByText("2.3 cm")).toBeTruthy();
  });
});

describe("FormRenderer markers from reading the photo", () => {
  const extraction: Extraction = {
    model: "m",
    fields: { modality: { colour: "amber", confidence: 0.6, sources: [{ page: 1, box: [1, 2, 3, 4] }], edited: false, value: "CT" } },
  };

  it("marks a field that was read, reports its sources when touched, and drops the mark once changed", async () => {
    const focused: Array<[string, AiField | null]> = [];
    function AiHarness() {
      const [values, setValues] = useState<Record<string, unknown>>({ modality: "CT" });
      return (
        <FormRenderer
          fields={FIELDS}
          values={values}
          onChange={setValues}
          errors={{}}
          readOnly={false}
          extraction={extraction}
          onFieldFocus={(path, ai) => focused.push([path, ai])}
        />
      );
    }
    const { container } = render(<AiHarness />);
    expect(container.querySelector('[data-ai="amber"]')).not.toBeNull();
    expect(screen.getByText("Please check")).toBeTruthy();
    await userEvent.click(screen.getByText("Please check"));
    expect(focused.at(-1)).toEqual(["modality", extraction.fields.modality]);
    await userEvent.click(screen.getByRole("radio", { name: "MRI" }));
    expect(container.querySelector("[data-ai]")).toBeNull();
  });

  it("lets a read-only reviewer ask to see where a value was read", async () => {
    const focused: string[] = [];
    render(
      <FormRenderer fields={FIELDS} values={{ modality: "CT" }} onChange={() => {}} errors={{}} readOnly extraction={extraction} onFieldFocus={(path) => focused.push(path)} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "See on the page" }));
    expect(focused).toContain("modality");
  });
});

function HospitalHarness({ start, hospital }: { start: Record<string, unknown>; hospital: Record<string, unknown> | null }) {
  const [values, setValues] = useState<Record<string, unknown>>(start);
  return <FormRenderer fields={INTAKE} values={values} onChange={setValues} errors={{}} readOnly={false} hospital={hospital} />;
}

describe("FormRenderer hospital values", () => {
  const HOSPITAL = { age_years: 56, visit_date: "2026-10-01" };

  it("shows From hospital on unchanged hospital values", () => {
    render(<HospitalHarness start={HOSPITAL} hospital={HOSPITAL} />);
    const age = screen.getByLabelText(/Age/).closest("[data-field]") as HTMLElement;
    expect(within(age).getByText("From hospital")).toBeTruthy();
  });

  it("warns with the exact copy when a hospital value is changed", async () => {
    render(<HospitalHarness start={HOSPITAL} hospital={HOSPITAL} />);
    await userEvent.click(screen.getByRole("button", { name: /Patient/ }));
    const input = screen.getByLabelText(/Age/);
    await userEvent.clear(input);
    await userEvent.type(input, "58");
    expect(screen.getByText("Hospital has 56. If you and an admin approve, the hospital's value will be changed to 58.")).toBeTruthy();
    expect(within(input.closest("[data-field]") as HTMLElement).queryByText("From hospital")).toBeNull();
  });

  it("warns that a cleared hospital value is kept by the hospital", async () => {
    render(<HospitalHarness start={HOSPITAL} hospital={HOSPITAL} />);
    await userEvent.click(screen.getByRole("button", { name: /Patient/ }));
    await userEvent.clear(screen.getByLabelText(/Age/));
    expect(screen.getByText("Hospital has 56. A blank is not sent; the hospital keeps its value.")).toBeTruthy();
  });

  it("no tag on fields the hospital lacked, nor on hand-typed records", () => {
    render(<HospitalHarness start={{ ...HOSPITAL, smoking: "never" }} hospital={HOSPITAL} />);
    expect(screen.getAllByText("From hospital")).toHaveLength(2);
    cleanup();
    render(<HospitalHarness start={HOSPITAL} hospital={null} />);
    expect(screen.queryByText("From hospital")).toBeNull();
  });

  it("a section entirely from the hospital starts closed", () => {
    render(<HospitalHarness start={HOSPITAL} hospital={HOSPITAL} />);
    expect(screen.getByRole("button", { name: /Patient/ }).getAttribute("aria-expanded")).toBe("false");
    cleanup();
    render(<HospitalHarness start={{}} hospital={null} />);
    expect(screen.getByRole("button", { name: /Patient/ }).getAttribute("aria-expanded")).toBe("true");
  });
});
