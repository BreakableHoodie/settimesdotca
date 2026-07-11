import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./credentials";

/* global navigator -- referenced inside a page.waitForFunction browser callback */

// Re-establish the admin session in THIS context. The shared storageState
// session (from auth.setup) is invalidated whenever another spec logs in —
// lucia.invalidateUserSessions() kills all other sessions on re-auth — so
// admin-mutating specs must log in themselves. Mirrors event-creation.spec.js.
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

/**
 * Offline resilience (#578, #554).
 *
 * The killer scenario for this app is a no-signal venue (a rural campground,
 * a basement stage): a fan loads their schedule, then the network drops. The
 * service worker must keep serving the saved schedule and the fan's route.
 *
 * This exercises the real SW: register → install → activate → control, then
 * `context.setOffline(true)` and assert a reload still renders the schedule
 * (from the SW's shell + /api/schedule caches) and the route (localStorage).
 * Requires the #578 precache fix — before it, the SW never activated because
 * cache.add() choked on Pages' clean-URL 308 redirects.
 */

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const localToday = () => new Date().toLocaleDateString("en-CA");
const localInstant = (dateStr, hours, minutes = 0) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, hours, minutes);
};

const getCsrfToken = async (page) => (await page.context().cookies()).find((c) => c.name === "csrf_token")?.value;

const apiGet = async (page, url) => {
  const res = await page.request.get(url);
  expect(res.ok(), `GET ${url} → ${res.status()}`).toBeTruthy();
  return res.json();
};

const apiPost = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const headers = csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  const res = await page.request.post(url, { data, headers });
  expect(res.ok(), `POST ${url} → ${res.status()}: ${await res.text()}`).toBeTruthy();
  return res.json();
};

test.describe("Offline resilience (#578)", () => {
  test("a saved schedule and route survive a network drop", async ({ page, context }) => {
    const suffix = uniqueSuffix();
    const today = localToday();
    const slug = `offline-${suffix}`;
    const bandName = `Offline Openers ${suffix}`;

    // Admin login + seeding at desktop viewport — the dark-pinned admin panel's
    // tabs aren't reliably visible at a 390px mobile width.
    await loginAsAdmin(page);

    // Seed a published event dated today with an evening set.
    const created = await apiPost(page, "/api/admin/events", {
      name: `Offline Test ${suffix}`,
      slug,
      date: today,
      city: "Waterloo, ON",
    });
    const eventId = created.event?.id ?? created.id;
    const venue = (await apiGet(page, "/api/admin/venues")).venues?.[0];
    await apiPost(page, "/api/admin/bands", {
      eventId,
      venueId: venue.id,
      name: bandName,
      startTime: "19:15",
      endTime: "19:45",
    });
    await apiPost(page, `/api/admin/events/${eventId}/publish`, { publish: true });

    // Switch to a phone viewport for the fan-facing flow — the venue scenario
    // this covers (no-signal campground) is a phone in someone's pocket.
    await page.setViewportSize({ width: 390, height: 844 });

    // Fixed clock in the morning: the set is upcoming, so it always renders
    // regardless of when the suite runs.
    await page.clock.setFixedTime(localInstant(today, 10, 0));

    const eventPage = `/event/${slug}`;

    // First online load: register + activate + take control of the page.
    await page.goto(eventPage);
    await expect(page.getByText(bandName).first()).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 20000,
    });

    // Save the band to My Route and confirm the selection registered (the
    // button flips Add → Remove, and the route is written to localStorage)
    // before moving on — don't race the reload against the state write.
    await page.getByRole("button", { name: `Add ${bandName} to my route` }).click();
    await expect(page.getByRole("button", { name: `Remove ${bandName} from my route` })).toBeVisible();

    // Reload ONCE while online and SW-controlled — this pass populates the
    // shell, JS chunk, and /api/schedule caches (the first load's fetches
    // predated SW control). The selection persists from localStorage.
    await page.reload();
    await expect(page.getByRole("button", { name: `Remove ${bandName} from my route` })).toBeVisible();

    // The network dies. A reload must still render the saved schedule (SW
    // caches) and the saved route (localStorage) — no white screen.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(bandName).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: `Remove ${bandName} from my route` })).toBeVisible({
      timeout: 20000,
    });

    await context.setOffline(false);
  });
});
