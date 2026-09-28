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
  const slug = `shared-route-${suffix}`;
  const created = await apiPost(page, "/api/admin/events", {
    name: `Shared Route ${suffix}`,
    slug,
    date: today,
    city: "Waterloo, ON",
  });
  const eventId = created.event?.id ?? created.id;
  const venue = (await apiGet(page, "/api/admin/venues")).venues?.[0];
  expect(eventId).toBeTruthy();
  expect(venue).toBeTruthy();

  const names = [`North Signal ${suffix}`, `East Lantern ${suffix}`, `South Current ${suffix}`];
  for (const [index, name] of names.entries()) {
    await apiPost(page, "/api/admin/bands", {
      eventId,
      venueId: venue.id,
      name,
      startTime: `${20 + index}:00`,
      endTime: `${20 + index}:45`,
    });
  }
  await apiPost(page, `/api/admin/events/${eventId}/publish`, { publish: true });
  return { slug, names };
};

test("a shared schedule link shows and imports exactly the selected stops", async ({ page, browser }) => {
  const suffix = uniqueSuffix();
  // login.spec.js invalidates the saved session; seeding needs a live one (#885).
  await loginAsAdmin(page);
  const { slug, names } = await seedEvent(page, suffix);
  await page.clock.setFixedTime(new Date(`${localToday()}T18:00:00`));
  await page.goto(`/event/${slug}`);
  const main = page.getByRole("main");

  await main.getByRole("button", { name: `Add ${names[0]} to my route` }).click();
  await main.getByRole("button", { name: `Add ${names[1]} to my route` }).click();
  await expect(main.getByRole("button", { name: `Remove ${names[0]} from my route` })).toBeVisible();
  await expect(main.getByRole("button", { name: `Remove ${names[1]} from my route` })).toBeVisible();

  await page.getByRole("button", { name: /^My Route/ }).click();
  const shareResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/schedule/share") && response.request().method() === "POST",
  );
  await main.getByRole("button", { name: "Copy shareable link to your schedule" }).click();
  const shareResponse = await shareResponsePromise;
  expect(shareResponse.ok()).toBeTruthy();
  const { slug: shareSlug } = await shareResponse.json();
  const shareUrl = `${new URL(page.url()).origin}/s/${shareSlug}`;

  const sharedContext = await browser.newContext();
  const sharedPage = await sharedContext.newPage();
  try {
    await sharedPage.goto(shareUrl);
    const routeList = sharedPage.getByRole("list", { name: "Bands in this route" });
    const routeItems = routeList.getByRole("listitem");
    await expect(routeItems).toHaveCount(2);
    await expect(routeItems.nth(0).getByText(names[0], { exact: true })).toBeVisible();
    await expect(routeItems.nth(1).getByText(names[1], { exact: true })).toBeVisible();
    await expect(routeList.getByText(names[2], { exact: true })).toHaveCount(0);

    await sharedPage.getByRole("button", { name: /Add 2 stops to my route/ }).click();
    const loadDialog = sharedPage.getByRole("dialog", { name: "Load Shared Route" });
    await expect(loadDialog).toBeVisible();
    await loadDialog.getByRole("button", { name: "Replace" }).click();

    const importedMain = sharedPage.getByRole("main");
    await expect(importedMain.getByRole("heading", { name: "My Route" })).toBeVisible();
    await expect(importedMain.getByRole("button", { name: `Remove ${names[0]} from my route` })).toBeVisible();
    await expect(importedMain.getByRole("button", { name: `Remove ${names[1]} from my route` })).toBeVisible();
    await expect(importedMain.getByRole("button", { name: `Remove ${names[2]} from my route` })).toHaveCount(0);
  } finally {
    await sharedContext.close();
  }
});
