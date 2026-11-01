// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteButton } from "./DeleteButton";

let patientRecords: string[];
let deleteResponse: () => Response;

beforeEach(() => {
  patientRecords = ["r1"];
  deleteResponse = () => {
    patientRecords = [];
    return new Response(null, { status: 204 });
  };
  vi.stubGlobal("fetch", vi.fn(async () => deleteResponse()));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** One row of a patient's page: the list comes from the ["patients", regNo] query, as on PatientPage. */
function PatientRecords() {
  const patient = useQuery({ queryKey: ["patients", "RC1"], queryFn: async () => [...patientRecords] });
  return (
    <ul>
      {patient.data?.map((id) => (
        <li key={id}>
          <span>record {id}</span>
          <DeleteButton recordId={id} />
        </li>
      ))}
    </ul>
  );
}

function renderList() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PatientRecords />
    </QueryClientProvider>,
  );
}

async function confirmDelete() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Yes, delete" }));
}

describe("DeleteButton", () => {
  it("takes the record off a patient's page once it is deleted", async () => {
    renderList();
    await confirmDelete();
    await waitFor(() => expect(screen.queryByText("record r1")).toBeNull());
  });

  it("shows the error and lets the user try again when the delete fails", async () => {
    deleteResponse = () => new Response(JSON.stringify({ detail: "Nope" }), { status: 409, headers: { "Content-Type": "application/json" } });
    renderList();
    await confirmDelete();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Yes, delete" }).disabled).toBe(false);
    expect(screen.getByText("record r1")).toBeTruthy();
  });
});
