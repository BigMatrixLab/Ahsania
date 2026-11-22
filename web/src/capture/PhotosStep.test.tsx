// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedPage } from "../imaging/render";
import { MAX_PAGES, PhotosStep } from "./PhotosStep";
import type { PageDraft } from "./types";

const pdfToPages = vi.fn();
vi.mock("../imaging/pdf", async (original) => ({ ...(await original<typeof import("../imaging/pdf")>()), pdfToPages: (...args: unknown[]) => pdfToPages(...args) }));

function fakePage(): PreparedPage {
  return { blob: new Blob(["x"], { type: "image/jpeg" }), width: 100, height: 140, blur: 500 };
}

function draft(i: number): PageDraft {
  return { id: `p${i}`, blob: new Blob(["x"]), url: `blob:${i}`, width: 100, height: 140, blur: 500 };
}

const pdf = new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" });

afterEach(cleanup);

beforeEach(() => {
  pdfToPages.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:new");
});

describe("PhotosStep", () => {
  it("adds every page of a picked PDF at once", async () => {
    pdfToPages.mockResolvedValue({ pages: [fakePage(), fakePage(), fakePage()], total: 3 });
    const onChange = vi.fn();
    render(<PhotosStep pages={[]} onChange={onChange} onBack={() => {}} onNext={() => {}} />);
    await userEvent.upload(screen.getByTestId("files-input"), pdf);
    expect(pdfToPages).toHaveBeenCalledWith(pdf, MAX_PAGES);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks only for the pages that still fit and says when some were left out", async () => {
    pdfToPages.mockResolvedValue({ pages: [fakePage(), fakePage()], total: 9 });
    const onChange = vi.fn();
    const existing = Array.from({ length: MAX_PAGES - 2 }, (_, i) => draft(i));
    render(<PhotosStep pages={existing} onChange={onChange} onBack={() => {}} onNext={() => {}} />);
    await userEvent.upload(screen.getByTestId("files-input"), pdf);
    expect(pdfToPages).toHaveBeenCalledWith(pdf, 2);
    expect(onChange.mock.calls[0][0]).toHaveLength(MAX_PAGES);
    expect(screen.getByText(/Only the first 2 of 9 PDF pages were added/)).toBeTruthy();
  });

  it("explains a PDF that cannot be opened", async () => {
    pdfToPages.mockRejectedValue(new Error("PasswordException"));
    const onChange = vi.fn();
    render(<PhotosStep pages={[]} onChange={onChange} onBack={() => {}} onNext={() => {}} />);
    await userEvent.upload(screen.getByTestId("files-input"), pdf);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/could not be opened/);
  });

  it("hides the add buttons once the capture is full", () => {
    const full = Array.from({ length: MAX_PAGES }, (_, i) => draft(i));
    render(<PhotosStep pages={full} onChange={() => {}} onBack={() => {}} onNext={() => {}} />);
    expect(screen.queryByRole("button", { name: "Files or PDF" })).toBeNull();
    expect(screen.getByText(/the most one capture can hold/)).toBeTruthy();
  });

  it("offers photo, gallery and files", () => {
    render(<PhotosStep pages={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}} />);
    expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gallery" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Files or PDF" })).toBeTruthy();
    expect(screen.getByTestId("files-input").getAttribute("accept")).toContain("application/pdf");
  });
});
