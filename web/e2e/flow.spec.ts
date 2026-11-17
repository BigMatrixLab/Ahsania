import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "demo-pass-123";
const DOCTOR_PASSWORD = "dr-test-pass-1";
const REPORT = fileURLToPath(new URL("./fixtures/report.jpg", import.meta.url));

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

async function login(username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("ID").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

async function logout() {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

/** A one-tap answer: its radio button is visually hidden, so tap the label as a finger would. */
async function pick(answer: string) {
  await page.locator("label", { hasText: new RegExp(`^${answer}$`) }).first().click();
}

/** Form, one cropped page, then the patient ID (typed over whatever was read off the photo); stops with both upload buttons ready. */
async function capture(patientId: string) {
  await page.getByRole("link", { name: "New capture" }).click();
  await expect(page.getByRole("button", { name: /Pathology/, includeHidden: true })).toBeDisabled();
  await page.getByRole("button", { name: /Radiology report/ }).click();
  await page.getByTestId("gallery-input").setInputFiles(REPORT);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.getByRole("button", { name: "Rotate left" }).click();
  await page.getByRole("button", { name: "Use this page" }).click();
  await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Reading the patient ID from the photos…")).toHaveCount(0, { timeout: 60_000 });
  await page.getByLabel("Patient ID (RC…)").fill(patientId);
  await expect(page.getByRole("button", { name: "Fill it from the photo" })).toBeEnabled();
}

async function openRecord(patientId: string) {
  await page.getByRole("link", { name: new RegExp(patientId) }).first().click();
}

test("a wrong password is refused; the admin signs in and out", async () => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("ID").fill("admin");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid ID or password");
  await login("admin");
  await expect(page.getByRole("banner").getByText("Demo Admin", { exact: true })).toBeVisible();
  await logout();
});

test("the admin creates a doctor account", async () => {
  await login("admin");
  await page.getByRole("link", { name: "Accounts" }).click();
  await page.getByLabel("Name").fill("Dr. Test");
  await page.getByLabel("ID").fill("dr.test");
  await page.getByLabel("Password").fill(DOCTOR_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("cell", { name: "dr.test" })).toBeVisible();
  await logout();
});

let aiRecord = "";
let handRecord = "";
let newPatientRecord = "";

test("the doctor refuses a malformed patient ID, then the photo fills the form", async () => {
  await login("dr.test", DOCTOR_PASSWORD);
  await expect(page.getByRole("banner").getByText("Dr. Test", { exact: true })).toBeVisible();
  await capture("12345");
  await page.getByRole("button", { name: "Fill it from the photo" }).click();
  await expect(page.getByRole("alert")).toHaveText("Patient ID must be RC followed by numbers");
  await page.getByLabel("Patient ID (RC…)").fill("rc 555");
  await page.getByRole("button", { name: "Fill it from the photo" }).click();
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/);
  aiRecord = page.url().split("/").pop()!;
  await expect(page.getByRole("link", { name: "Patient RC555" })).toBeVisible();
  // The worker reads the page with real OCR and plain rules, and turns the record into a pre-filled draft.
  await expect(page.getByTestId("record-status")).toHaveText("Draft", { timeout: 90_000 });

  await expect(page.getByRole("radio", { name: "CT", exact: true })).toBeChecked();
  await expect(page.getByLabel("Study date")).toHaveValue("2026-09-01");
  await expect(page.getByText("1 Sep 2026").first()).toBeVisible();
  await expect(page.getByLabel("Lobe")).toHaveValue("RUL");
  await expect(page.locator('[data-field="lesions[0].short_axis_cm"]')).toHaveAttribute("data-ai", "green");
  // Tapping a field outlines where it was read, and shows that part of the photo right under the field.
  await page.getByLabel("Short axis").focus();
  await expect(page.getByTestId("source-box")).toBeVisible();
  await expect(page.getByTestId("source-snippet")).toBeVisible();
  // A mistake the server flags as soon as it saves, then the fix.
  await page.getByLabel("Long axis").fill("abc");
  await expect(page.getByText("must be a number")).toBeVisible();
  await page.getByLabel("Long axis").fill("2.");
  await page.getByLabel("Long axis").pressSequentially("4");
  await expect(page.getByLabel("Long axis")).toHaveValue("2.4");
  await page.getByRole("button", { name: "Approve and send to admin" }).click();
  await expect(page.getByTestId("record-status")).toHaveText("Waiting for admin");
  await expect(page.getByRole("radio", { name: "CT", exact: true })).toHaveCount(0);
  await expect(page.getByText("Modality")).toBeVisible();
});

test("the doctor fills a second record by hand without waiting", async () => {
  await page.goto("/");
  await capture("RC777");
  await page.getByRole("button", { name: "I'll fill it myself" }).click();
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/);
  handRecord = page.url().split("/").pop()!;
  await expect(page.getByTestId("record-status")).toHaveText("Draft");
  await expect(page.getByRole("radio", { name: "CT", exact: true })).not.toBeChecked();
  await pick("MRI");
  await page.getByLabel("Study date").fill("2026-08-15");
  await page.getByRole("button", { name: "Approve and send to admin" }).click();
  await expect(page.getByTestId("record-status")).toHaveText("Waiting for admin");
});

let hospitalRecord = "";

test("the doctor types an RC the hospital lacks, and leaving the page loses nothing", async () => {
  await page.goto("/");
  await page.getByRole("link", { name: /Import patient/ }).click();
  await page.getByRole("button", { name: "Not in the list? Type the RC number" }).click();
  await page.getByLabel("Patient ID (RC…)").fill("RC900");
  await page.getByRole("button", { name: "Start form" }).click();
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/);
  newPatientRecord = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "Import patient" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Page/ })).toHaveCount(0);
  await expect(page.getByText("From hospital")).toHaveCount(0);

  // Type and leave at once: the answer goes with the doctor.
  await page.getByLabel(/^Age at diagnosis/).fill("62");
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "My drafts" })).toBeVisible();
  await page.goto(`/records/${newPatientRecord}`);
  await expect(page.getByLabel(/^Age at diagnosis/)).toHaveValue("62");

  // Sending too early says what is missing and opens the way to it.
  await page.getByRole("button", { name: "Approve and send to admin" }).click();
  await expect(page.getByText("Fix the highlighted fields before approving")).toBeVisible();
  await expect(page.getByText("Still needed:")).toBeVisible();
  await page.getByRole("button", { name: "ECOG performance status" }).click();
  await pick("male");
  await pick("current");
  // A conditional question appears only for a smoker.
  await page.getByLabel("Pack-years").fill("30");
  await pick("1");
  await page.getByRole("button", { name: "Approve and send to admin" }).click();
  await expect(page.getByTestId("record-status")).toHaveText("Waiting for admin");
  await logout();
});

test("the doctor imports a patient from the hospital and corrects one value", async () => {
  await login("dr.test", DOCTOR_PASSWORD);
  await page.getByRole("link", { name: /Import patient/ }).click();
  await page.getByLabel("Search RC number").fill("500001");
  await page.getByRole("button", { name: /RC500001/ }).click();
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/);
  hospitalRecord = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "Import patient" })).toBeVisible();
  await expect(page.getByText("From hospital").first()).toBeVisible();

  // The hospital says 36; the doctor knows better and is told what will happen.
  await expect(page.getByLabel(/^Age at diagnosis/)).toHaveValue("36");
  await page.getByLabel(/^Age at diagnosis/).fill("37");
  await expect(page.getByText("Hospital has 36. If you and an admin approve, the hospital's value will be changed to 37.")).toBeVisible();

  // Approving lists the change to the hospital's value before anything is sent.
  await page.getByRole("button", { name: "Approve and send to admin" }).click();
  await expect(page.getByText("Age at diagnosis: 36 → 37")).toBeVisible();
  await page.getByRole("button", { name: "Yes, send to admin" }).click();
  await expect(page.getByTestId("record-status")).toHaveText("Waiting for admin");

  // Importing the same patient again points to the one already here.
  await page.goto("/import-patient");
  await page.getByLabel("Search RC number").fill("500001");
  await expect(page.getByRole("button", { name: /RC500001/ })).toContainText("imported");
  await page.getByRole("button", { name: /RC500001/ }).click();
  await expect(page.getByRole("link", { name: "Open RC500001" })).toBeVisible();
  await logout();
});

test("the admin sends the first record back; the doctor fixes it and approves again", async () => {
  await login("admin");
  await expect(page.getByRole("heading", { name: "Waiting for admin" })).toBeVisible();
  await openRecord("RC555");
  // On a phone the photo sits above the form: the admin must still see where to confirm.
  await page.setViewportSize({ width: 390, height: 560 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Send back…" }).click();
  await expect(page.getByRole("button", { name: "Confirm" })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel("What needs fixing?").fill("Please check the short axis");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toHaveText("Sent back to the doctor");
  await logout();

  await login("dr.test", DOCTOR_PASSWORD);
  const sentBack = page.locator("section", { has: page.getByRole("heading", { name: "Sent back to me" }) });
  await expect(sentBack.getByText("RC555")).toBeVisible();
  await openRecord("RC555");
  // The comment also appears in History, so match the banner's whole text to keep the locator strict.
  await expect(page.getByText(/^Sent back by .+: Please check the short axis$/)).toBeVisible();
  await page.getByLabel("Short axis").fill("1.9");
  await page.getByRole("button", { name: "Approve and send to admin" }).click();
  await expect(page.getByTestId("record-status")).toHaveText("Waiting for admin");
  await logout();
});

test("the admin approves the records, the hospital gets its values, and the dataset downloads", async () => {
  await login("admin");
  for (const id of [aiRecord, handRecord, newPatientRecord]) {
    await page.goto(`/records/${id}`);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("record-status")).toHaveText("Approved");
  }
  // The typed-in patient is not in the hospital system, so nothing can go there.
  await expect(page.getByText(/Not at hospital/)).toBeVisible();

  // The imported patient: the admin sees the change to the hospital's value before approving.
  await page.goto(`/records/${hospitalRecord}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Age at diagnosis: 36 → 37")).toBeVisible();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByTestId("record-status")).toHaveText("Approved");
  await expect(page.getByText(/^Sent to hospital/)).toBeVisible();

  await page.getByRole("link", { name: "All records" }).click();
  await page.getByLabel("Show").selectOption("approved");
  await expect(page.getByRole("link", { name: /RC555/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /RC777/ })).toBeVisible();

  await page.getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByLabel("Find a patient").fill("rc 9");
  await expect(page.getByText("62 y · male · current smoker, 30 pack-years")).toBeVisible();
  await page.getByRole("link", { name: /^RC900/ }).click();
  await expect(page.getByRole("heading", { name: "RC900" })).toBeVisible();
  await expect(page.getByText("No approved scans yet")).toBeVisible();
  await page.getByRole("link", { name: "Import patient" }).or(page.getByRole("link", { name: /RC900/ })).first().click();
  await expect(page.getByRole("heading", { name: "Import patient" })).toBeVisible();
  await expect(page.getByText("30")).toBeVisible();

  await page.getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByLabel("Find a patient").fill("rc500001");
  await expect(page.getByText(/^37 y · male · current smoker/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download dataset" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^export-\d{8}-\d{6}\.zip$/);
  const zip = readFileSync(await download.path());
  expect(zip.includes("manifest.json")).toBe(true);
  expect(zip.includes("import_patient.csv")).toBe(true);
  await logout();
});

test("an upload made while the server is unreachable waits on the device and goes up on Try now", async () => {
  await login("dr.test", DOCTOR_PASSWORD);
  await capture("RC888");
  await page.route("**/api/**", (route) => route.abort());
  await page.getByRole("button", { name: "I'll fill it myself" }).click();
  await expect(page.getByText("Saved on this device — it will upload when the connection is back.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try now" })).toBeVisible();

  await page.unroute("**/api/**");
  await page.getByRole("button", { name: "Try now" }).click();
  await expect(page.getByRole("button", { name: "Try now" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /RC888/ }).first()).toBeVisible();
  await logout();
});

test("the doctor deletes a capture that never went to the admin", async () => {
  await login("dr.test", DOCTOR_PASSWORD);
  await openRecord("RC888");
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("Capture deleted.")).toBeVisible();
  await expect(page.getByRole("link", { name: /RC888/ })).toHaveCount(0);
  await logout();
});
