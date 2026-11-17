// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Me, PatientSummary } from "../api/types";
import PatientsPage from "./PatientsPage";

const DOCTOR: Me = { id: 1, name: "Demo Doctor", username: "doctor", role: "doctor" };
const ADMIN: Me = { id: 9, name: "Demo Admin", username: "admin", role: "admin" };
const state: { me: Me } = { me: DOCTOR };
vi.mock("../auth/RequireAuth", () => ({ useCurrentUser: () => state.me }));

const CT = { date: "2026-01-10", image: true, report: false, days_after_baseline: 0 };
const XRAY = { date: "2026-03-01", image: true, report: false, days_after_baseline: 50 };

function patient(reg_no: string, extra: Partial<PatientSummary> = {}): PatientSummary {
  return { reg_no, record_count: 2, approved_count: 2, baseline: null, xrays: [], paired: false, profile: null, ...extra };
}

let patients: PatientSummary[];

beforeEach(() => {
  state.me = DOCTOR;
  patients = [
    patient("RC12", { baseline: CT, xrays: [XRAY], paired: true, profile: { age_years: 62, sex: "male" } }),
    patient("RC120", { baseline: CT, approved_count: 1 }),
    patient("RC7", { record_count: 1, approved_count: 0 }),
  ];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(patients), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PatientsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("PatientsPage", () => {
  it("sums up the study: patients, pairs and approved records", async () => {
    renderPage();
    const totals = await screen.findByRole("list", { name: "Totals" });
    expect(within(totals).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["3 patients", "1 paired", "3 approved records"]);
  });

  it("says what each patient still needs", async () => {
    renderPage();
    expect(await screen.findByText("Paired")).toBeTruthy();
    expect(screen.getByText("Needs follow-up X-ray")).toBeTruthy();
    expect(screen.getByText("No approved scans yet")).toBeTruthy();
  });

  it("shows who the patient is when the first-visit form exists", async () => {
    renderPage();
    expect(await screen.findByText("62 y · male")).toBeTruthy();
  });

  it("finds a patient by a loosely typed ID", async () => {
    renderPage();
    await screen.findByRole("link", { name: /RC120/ });
    await userEvent.type(screen.getByLabelText("Find a patient"), "rc 12");
    expect(screen.getByRole("link", { name: /^RC12(?!0)/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^RC120/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^RC7/ })).toBeNull();
  });

  it("says so when the search finds nobody", async () => {
    renderPage();
    await screen.findByRole("link", { name: /RC120/ });
    await userEvent.type(screen.getByLabelText("Find a patient"), "RC999");
    expect(screen.getByText("No patient with that ID.")).toBeTruthy();
  });

  it("offers the admin the dataset download, and not a doctor", async () => {
    state.me = ADMIN;
    renderPage();
    const link = await screen.findByRole("link", { name: /Download dataset/ });
    expect(link.getAttribute("href")).toBe("/api/export");
    cleanup();
    state.me = DOCTOR;
    renderPage();
    await screen.findByRole("link", { name: /RC120/ });
    expect(screen.queryByRole("link", { name: /Download dataset/ })).toBeNull();
  });

  it("tells a doctor how to begin when there are no patients yet", async () => {
    patients = [];
    renderPage();
    expect(await screen.findByText("No patients yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Import patient" }).getAttribute("href")).toBe("/import-patient");
  });
});
