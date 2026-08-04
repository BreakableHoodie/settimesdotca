import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./credentials";

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Always 90 days from today — keeps tests valid as time passes
const futureDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
};

const loginAsAdmin = async (page) => {
  await page.goto("/admin");
  await page.waitForSelector('button[role="tab"], input[type="email"]', { state: "visible", timeout: 15000 });
  if (await page.locator('input[type="email"]').isVisible()) {
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('button[role="tab"]', { state: "visible", timeout: 15000 });
  }
};

const getCsrfToken = async (page) => {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "csrf_token")?.value;
};

const deleteEvent = async (page, eventName) => {
  const csrfToken = await getCsrfToken(page);
  const { events } = await (await page.request.get("/api/admin/events?limit=100")).json();
  const event = events?.find((e) => e.name === eventName);
  if (event) {
    await page.request.delete(`/api/admin/events/${event.id}?confirmCascade=true`, {
      headers: { "X-CSRF-Token": csrfToken },
    });
  }
};

test.describe("Event Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("creates event with venue and band through full wizard flow", async ({ page }) => {
    const suffix = uniqueSuffix();
    const eventName = `Wizard Fest ${suffix}`;
    const dialog = page.getByRole("dialog", { name: "Create Event" });

    // Open wizard from header button
    await page.getByRole("button", { name: "Create Event" }).click();
    await expect(dialog).toBeVisible();

    // Step 1: Event Basics
    await expect(dialog.getByRole("heading", { name: "Event Basics" })).toBeVisible();
    await dialog.getByRole("textbox", { name: "Event Name *" }).fill(eventName);
    await dialog.getByRole("textbox", { name: "Event Date *" }).fill(futureDate());
    // Slug auto-populates from name — Next enables once all required fields are set
    await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Step 2: Venues — Next is disabled until at least one venue is added
    await expect(dialog.getByRole("heading", { name: "Venues" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Venue name" }).fill("The Playwright Lounge");
    await dialog.getByRole("textbox", { name: "Address (optional)" }).fill("123 Test Ave");
    await dialog.getByRole("button", { name: "Add Venue" }).click();
    await expect(dialog.getByText("The Playwright Lounge")).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Step 3: Bands
    await expect(dialog.getByRole("heading", { name: "Bands" })).toBeVisible();
    await dialog.getByRole("textbox", { name: "Band name" }).fill("The Test Subjects");
    await dialog.getByRole("combobox").selectOption("The Playwright Lounge");
    await dialog.getByPlaceholder("Start time").fill("20:00");
    await dialog.getByPlaceholder("End time").fill("21:30");
    await dialog.getByRole("button", { name: "Add Band" }).click();
    await expect(dialog.getByText("The Test Subjects")).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Step 4: Review & Publish
    await expect(dialog.getByRole("heading", { name: "Review & Publish" })).toBeVisible();
    await expect(dialog.getByText(eventName)).toBeVisible();
    await expect(dialog.getByText("1 venue(s)")).toBeVisible();
    await expect(dialog.getByText("1 band(s)")).toBeVisible();
    await dialog.getByRole("button", { name: "Publish Event" }).click();

    // Wizard closes and global success toast appears
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("alert")).toContainText(`Event "${eventName}" created successfully!`);

    // App auto-navigates to the new event's Lineup tab — verify band is there.
    // `exact` is required: the row's ACTIONS cell contains per-row buttons
    // labelled with the band name ("Cancel The Test Subjects", "Edit"), so its
    // accessible name also contains this string and a substring match resolves
    // to two cells (#732). Match the name cell alone.
    await expect(page.getByRole("cell", { name: "The Test Subjects", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "The Playwright Lounge" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "8:00 PM – 9:30 PM" })).toBeVisible();

    await deleteEvent(page, eventName);
  });

  test("disables Next on venues step until a venue is added", async ({ page }) => {
    const suffix = uniqueSuffix();
    const dialog = page.getByRole("dialog", { name: "Create Event" });

    await page.getByRole("button", { name: "Create Event" }).click();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: "Event Name *" }).fill(`Wizard Fest ${suffix}`);
    await dialog.getByRole("textbox", { name: "Event Date *" }).fill(futureDate());
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(dialog.getByRole("heading", { name: "Venues" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("shows error in dialog when slug already exists", async ({ page }) => {
    const suffix = uniqueSuffix();
    const dialog = page.getByRole("dialog", { name: "Create Event" });

    await page.getByRole("button", { name: "Create Event" }).click();
    await expect(dialog).toBeVisible();

    // Fill name first (auto-populates slug), then override slug with a known-taken value
    await dialog.getByRole("textbox", { name: "Event Name *" }).fill(`Duplicate Slug ${suffix}`);
    await dialog.getByRole("textbox", { name: "Event Date *" }).fill(futureDate());
    await dialog.getByRole("textbox", { name: "URL Slug *" }).fill("winter-warm-up-2024");
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByRole("textbox", { name: "Venue name" }).fill("Any Venue");
    await dialog.getByRole("button", { name: "Add Venue" }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByRole("textbox", { name: "Band name" }).fill("Any Band");
    await dialog.getByRole("combobox").selectOption("Any Venue");
    await dialog.getByPlaceholder("Start time").fill("19:00");
    await dialog.getByPlaceholder("End time").fill("20:00");
    await dialog.getByRole("button", { name: "Add Band" }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Wait for the API response before asserting the error alert — on a cold CI runner
    // the slug-conflict response can be slow, causing a first-attempt flake.
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/admin/events") && !resp.ok()),
      dialog.getByRole("button", { name: "Publish Event" }).click(),
    ]);

    // Error renders inside the dialog (not the global toast)
    await expect(dialog.getByRole("alert")).toContainText("slug already exists");
    await expect(dialog).toBeVisible();
  });
});
