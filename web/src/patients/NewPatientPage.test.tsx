// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewPatientPage from "./NewPatientPage";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage(url = "/new-patient") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient()}>
        <Routes>
          <Route path="/new-patient" element={<NewPatientPage />} />
          <Route path="/records/:id" element={<p>Record opened</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewPatientPage", () => {
  it("opens the first-visit form with no photo", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => reply(201, { id: "abc" }));
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();
    await userEvent.type(screen.getByLabelText(/Patient ID/), "rc 123");
    await userEvent.click(screen.getByRole("button", { name: "Start first-visit form" }));
    expect(await screen.findByText("Record opened")).toBeTruthy();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/records");
    const form = init!.body as FormData;
    const meta = JSON.parse(String(form.get("meta")));
    expect(meta.reg_no).toBe("RC123");
    expect(meta.template_key).toBe("new_patient_lung");
    expect(meta.client_upload_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(form.getAll("pages")).toEqual([]);
  });

  it("refuses a badly typed ID without calling the server", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();
    await userEvent.type(screen.getByLabelText(/Patient ID/), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Start first-visit form" }));
    expect(screen.getByRole("alert").textContent).toBe("Patient ID must be RC followed by numbers");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("points to the patient who already has a form, rather than making a second one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(409, { detail: "This patient already has this form" })));
    renderPage();
    await userEvent.type(screen.getByLabelText(/Patient ID/), "RC123");
    await userEvent.click(screen.getByRole("button", { name: "Start first-visit form" }));
    const link = await screen.findByRole("link", { name: "Open RC123" });
    expect(link.getAttribute("href")).toBe("/patients/RC123");
  });

  it("says when the server cannot be reached and keeps what was typed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    renderPage();
    await userEvent.type(screen.getByLabelText(/Patient ID/), "RC123");
    await userEvent.click(screen.getByRole("button", { name: "Start first-visit form" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not reach the server"));
    expect((screen.getByLabelText(/Patient ID/) as HTMLInputElement).value).toBe("RC123");
  });

  it("starts with the ID when it comes from a patient's page", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderPage("/new-patient?patient=RC55");
    expect((screen.getByLabelText(/Patient ID/) as HTMLInputElement).value).toBe("RC55");
  });
});
