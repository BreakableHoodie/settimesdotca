import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils/session";

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const localToday = () => new Date().toLocaleDateString("en-CA");

const getCsrfToken = async (page) =>
  (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token")?.value;

const apiGet = async (page, url) => {
  const response = await page.request.get(url);
  expect(response.ok(), `GET ${url} -> ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const apiPost = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const response = await page.request.post(url, {
    data,
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
  });
  expect(response.ok(), `POST ${url} -> ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const seedEvent = async (page, suffix) => {
  const today = localToday();
  const slug = `schedule-swap-${suffix}`;
  const created = await apiPost(page, "/api/admin/events", {
    name: `Schedule Swap ${suffix}`,
    slug,
    date: today,
    city: "Waterloo, ON",
  });
  const eventId = created.event?.id ?? created.id;
  const venue = (await apiGet(page, "/api/admin/venues")).venues?.[0];
  expect(eventId).toBeTruthy();
  expect(venue).toBeTruthy();

  await apiPost(page, "/api/admin/bands", {
    eventId,
    venueId: venue.id,
    name: `First Signal ${suffix}`,
    startTime: "20:00",
    endTime: "20:45",
  });
  await apiPost(page, "/api/admin/bands", {
    eventId,
    venueId: venue.id,
    name: `Second Signal ${suffix}`,
    startTime: "21:00",
    endTime: "21:45",
  });
  await apiPost(page, `/api/admin/events/${eventId}/publish`, { publish: true });
  return {
    eventId,
    slug,
    firstName: `First Signal ${suffix}`,
    secondName: `Second Signal ${suffix}`,
  };
};

test("the schedule grid saves a two-set time swap in one request", async ({ page }) => {
  const suffix = uniqueSuffix();
  // login.spec.js invalidates the saved session; seeding needs a live one (#885).
  await loginAsAdmin(page);
  const { eventId, slug, firstName, secondName } = await seedEvent(page, suffix);
  await page.clock.setFixedTime(new Date(`${localToday()}T18:00:00`));
  await page.goto("/admin");

  await page.getByRole("tab", { name: "Events" }).click();
  await page.getByRole("button", { name: `Schedule Swap ${suffix}`, exact: true }).click();
  await expect(page.getByRole("tab", { name: "Lineup" })).toBeVisible();
  await page.getByRole("tab", { name: "Lineup" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  await expect(page.getByRole("table", { name: /Set times and venues/ })).toBeVisible();
  await page.getByLabel(`Start time for ${firstName}`).fill("21:00");
  await page.getByLabel(`End time for ${firstName}`).fill("21:45");
  await page.getByLabel(`Start time for ${secondName}`).fill("20:00");
  await page.getByLabel(`End time for ${secondName}`).fill("20:45");
  await expect(page.getByText("2 unsaved changes", { exact: true })).toBeVisible();

  let scheduleRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(`/api/admin/events/${eventId}/schedule`) && request.method() === "PUT") {
      scheduleRequests += 1;
    }
  });
  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/events/${eventId}/schedule`) && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save schedule (2 changes)" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();
  expect(scheduleRequests).toBe(1);
  await expect(page.getByText("No unsaved changes", { exact: true })).toBeVisible();
  await expect(page.getByText(/conflict/i)).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("table", { name: /Set times and venues/ })).toBeVisible();
  await expect(page.getByLabel(`Start time for ${firstName}`)).toHaveValue("21:00");
  await expect(page.getByLabel(`Start time for ${secondName}`)).toHaveValue("20:00");

  await page.goto(`/event/${slug}`);
  const publicMain = page.getByRole("main");
  await expect(publicMain.getByText(secondName, { exact: true })).toBeVisible();
  const publicGroups = publicMain.locator('[role="group"]');
  await expect
    .poll(() =>
      publicGroups.evaluateAll(
        (groups, pair) =>
          groups.map((group) => group.getAttribute("aria-label")?.split(" at ")[0]).filter((n) => pair.includes(n)),
        [firstName, secondName],
      ),
    )
    .toEqual([secondName, firstName]);
});
