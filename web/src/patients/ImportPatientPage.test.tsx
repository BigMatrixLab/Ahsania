// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportPatientPage from "./ImportPatientPage";

const DOWN = "Hospital system not reachable. Type the RC number and fill the form by hand.";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function template(key: string, title: string, extra: Record<string, unknown> = {}) {
  return { key, title, version: 1, phase: 1, kind: "form", locked: false, definition: { key, title, version: 1, phase: 1, kind: "form", fields: [], ...extra } };
}

const TEMPLATES = [
  template("toxicity_outcome", "Toxicity & outcome", { hospital: true, repeats: true }),
  template("import_patient", "Import patient", { hospital: true }),
  template("treatment", "Treatment", { hospital: true, repeats: true }),
  template("new_patient_lung", "New patient (lung cancer)", { retired: true }),
];
const PATIENTS = [
  { rc: "RC500001", imported: true },
  { rc: "RC500002", imported: false },
  { rc: "RC500013", imported: false },
];

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function server(overrides: { patients?: Handler; create?: Handler } = {}) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/templates") return reply(200, TEMPLATES);
    if (url.startsWith("/api/hospital/patients")) return overrides.patients ? overrides.patients(url, init) : reply(200, PATIENTS);
    if (url === "/api/records") return overrides.create ? overrides.create(url, init) : reply(201, { id: "abc" });
    return reply(404, { detail: "not mocked" });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function metaOf(spy: ReturnType<typeof server>) {
  const call = spy.mock.calls.find(([url]) => url === "/api/records");
  return JSON.parse(String((call![1]!.body as FormData).get("meta")));
}

function renderPage(url = "/import-patient") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/import-patient" element={<ImportPatientPage />} />
          <Route path="/records/:id" element={<p>Record opened</p>} />
          <Route path="/patients/:regNo" element={<p>Patient page</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImportPatientPage", () => {
  it("lists hospital RC numbers and marks imported ones", async () => {
    server();
    renderPage();
    expect(await screen.findByRole("button", { name: /RC500002/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /RC500001/ }).textContent).toContain("imported");
    expect(screen.getByRole("button", { name: /RC500002/ }).textContent).not.toContain("imported");
  });

  it("offers the three hospital forms, Import patient first and chosen, and no retired form", async () => {
    server();
    renderPage();
    const choices = await screen.findAllByRole("radio");
    expect(choices.map((c) => c.getAttribute("aria-label") ?? c.parentElement?.textContent)).toEqual(["Import patient", "Treatment", "Toxicity & outcome"]);
    expect((choices[0] as HTMLInputElement).checked).toBe(true);
  });

  it("typing filters the list", async () => {
    server();
    renderPage();
    await screen.findByRole("button", { name: /RC500002/ });
    await userEvent.type(screen.getByLabelText("Search RC number"), "13");
    expect(screen.queryByRole("button", { name: /RC500002/ })).toBeNull();
    expect(screen.getByRole("button", { name: /RC500013/ })).toBeTruthy();
  });

  it("picking an RC creates the record from the hospital and opens it", async () => {
    const spy = server();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /RC500002/ }));
    expect(await screen.findByText("Record opened")).toBeTruthy();
    const meta = metaOf(spy);
    expect(meta).toMatchObject({ reg_no: "RC500002", template_key: "import_patient", from_hospital: true });
  });

  it("choosing Treatment sends template_key treatment and lists for that form", async () => {
    const spy = server();
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: "Treatment" }));
    await waitFor(() => expect(spy.mock.calls.some(([url]) => url === "/api/hospital/patients?form=treatment")).toBe(true));
    await userEvent.click(await screen.findByRole("button", { name: /RC500002/ }));
    await screen.findByText("Record opened");
    expect(metaOf(spy).template_key).toBe("treatment");
  });

  it("hospital down shows the message and opens manual entry", async () => {
    server({ patients: () => reply(503, { detail: DOWN }) });
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain(DOWN);
    expect(screen.getByLabelText(/Patient ID/)).toBeTruthy();
  });

  it("manual entry posts from_hospital false and validates the RC number", async () => {
    const spy = server();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Not in the list? Type the RC number" }));
    await userEvent.type(screen.getByLabelText(/Patient ID/), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Start form" }));
    expect(screen.getByRole("alert").textContent).toBe("Patient ID must be RC followed by numbers");
    await userEvent.clear(screen.getByLabelText(/Patient ID/));
    await userEvent.type(screen.getByLabelText(/Patient ID/), "rc 77");
    await userEvent.click(screen.getByRole("button", { name: "Start form" }));
    await screen.findByText("Record opened");
    expect(metaOf(spy)).toMatchObject({ reg_no: "RC77", template_key: "import_patient", from_hospital: false });
  });

  it("an RC the hospital does not know says so and opens manual entry", async () => {
    server({ create: () => reply(404, { detail: "This RC number is not in the hospital system." }) });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /RC500002/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("This RC number is not in the hospital system.");
    expect((screen.getByLabelText(/Patient ID/) as HTMLInputElement).value).toBe("RC500002");
  });

  it("points to the patient who already has a first-visit form", async () => {
    server({ create: () => reply(409, { detail: "This patient already has this form" }) });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /RC500001/ }));
    const link = await screen.findByRole("link", { name: "Open RC500001" });
    expect(link.getAttribute("href")).toBe("/patients/RC500001");
  });

  it("?patient=RC55 prefills the search", async () => {
    server();
    renderPage("/import-patient?patient=RC55");
    expect((screen.getByLabelText("Search RC number") as HTMLInputElement).value).toBe("RC55");
  });
});
