import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./credentials";

/**
 * Cancellation feature — E2E rendering + accessibility coverage (#732).
 *
 * Unit tests already cover computeNextMove/BandCard suppression logic in
 * isolation (frontend/src/components/__tests__/BandCard.cancelled.test.jsx,
 * frontend/src/utils/__tests__/nextMove.cancelled.test.js). This spec proves
 * the same behaviour survives a REAL render on a REAL page: the visible
 * "Cancelled" pill is the accessible carrier (line-through alone is not
 * announced by NVDA/JAWS and would fail WCAG 1.4.1), and the four shipped
 * colour themes (frontend/src/components/ThemeProvider.jsx) keep both the
 * pill and the struck-through name legible — the two light themes
 * (daybreak, silver-lining) are where hardcoded whites and low-contrast
 * tokens have broken before (#566/#567).
 */

const THEME_STORAGE_KEY = "settimes-theme";
const THEMES = ["midnight-ember", "arctic-night", "daybreak", "silver-lining"];

// Idempotent, matching e2e/band-management.spec.js. The chromium project
// loads a saved storageState (playwright.config.js), so the context usually
// arrives ALREADY authenticated -- navigating to /admin/login then redirects
// straight to /admin and there is no form to fill. An unconditional login
// therefore hangs on `page.fill` until the 30s test timeout. Wait for either
// outcome and only log in when the form is actually present.
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
  return cookies.find((cookie) => cookie.name === "csrf_token")?.value;
};

const apiGet = async (page, url) => {
  const response = await page.request.get(url);
  expect(response.ok(), `GET ${url} → ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const apiPost = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const headers = csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  const response = await page.request.post(url, { data, headers });
  expect(response.ok(), `POST ${url} → ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const apiPatch = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const headers = csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  const response = await page.request.patch(url, { data, headers });
  expect(response.ok(), `PATCH ${url} → ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

// Local calendar date (YYYY-MM-DD) — matches the browser clock mock below so
// isSameLocalDay() logic in the app holds regardless of machine timezone.
const localToday = () => new Date().toLocaleDateString("en-CA");

// A local-time instant on a YYYY-MM-DD day. Numeric constructor on purpose —
// never new Date('YYYY-MM-DD...') strings (UTC-parse drift, see CLAUDE.md).
const localInstant = (dateStr, hours, minutes = 0) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, hours, minutes);
};

/**
 * Seeds one published event with two sets at the same venue: a cancelled
 * set whose 19:00–19:30 window brackets the fixed clock time below (so
 * WITHOUT the suppression it would show "Live Now" and be selectable — the
 * fixture must sit inside the live window, or a broken suppression and a
 * correct one would look identical), and a normal scheduled set later the
 * same night as a live comparison baseline.
 */
async function seedEventWithCancelledSet(page, suffix) {
  await loginAsAdmin(page);

  const today = localToday();
  const slug = `cancelled-set-${suffix}`;

  const created = await apiPost(page, "/api/admin/events", {
    name: `Cancelled Set Coverage ${suffix}`,
    slug,
    date: today,
    city: "Waterloo, ON",
    doors_json: JSON.stringify({ [today]: "18:00" }),
  });
  const eventId = created.event?.id ?? created.id;
  expect(eventId).toBeTruthy();

  const venuesData = await apiGet(page, "/api/admin/venues");
  const venue = venuesData.venues?.[0];
  expect(venue).toBeTruthy();

  // Deliberately avoid the words "Cancelled"/"Scheduled" in fixture names.
  // The assertions locate the state pill by its visible text, so a band
  // literally named "Cancelled Openers" makes getByText("Cancelled") match
  // both the band name and the pill -- a strict-mode violation that reads as
  // a product bug rather than a fixture mistake.
  const cancelledName = `Pulled Openers ${suffix}`;
  const scheduledName = `Playing Headliner ${suffix}`;

  const cancelledBand = await apiPost(page, "/api/admin/bands", {
    eventId,
    venueId: venue.id,
    name: cancelledName,
    startTime: "19:00",
    endTime: "19:30",
  });
  const cancelledPerformanceId = cancelledBand.band?.id;
  expect(cancelledPerformanceId).toBeTruthy();

  await apiPost(page, "/api/admin/bands", {
    eventId,
    venueId: venue.id,
    name: scheduledName,
    startTime: "20:00",
    endTime: "20:30",
  });

  await apiPost(page, `/api/admin/events/${eventId}/publish`, { publish: true });

  await apiPatch(page, `/api/admin/bands/${cancelledPerformanceId}`, { is_cancelled: true });

  return { slug, today, venueName: venue.name, cancelledName, scheduledName };
}

test.describe("Cancelled set — rendering and accessibility (#732)", () => {
  test("a cancelled set is marked accessibly and is not selectable", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { slug, today, venueName, cancelledName, scheduledName } = await seedEventWithCancelledSet(page, suffix);

    // Fixed at 19:15 — inside the cancelled set's 19:00–19:30 window, so any
    // assertion below that the card is quiet proves the suppression actually
    // fired, not that the fixture happened to be off-hours.
    await page.clock.setFixedTime(localInstant(today, 19, 15));
    await page.goto(`/event/${slug}`);

    // BandCard renders a non-interactive cancelled card with role="group"
    // and an aria-label of "<name> at <venue>" (frontend/src/components/
    // BandCard.jsx) — a stable, accessible-name-based locator that doesn't
    // depend on grid/list markup.
    const card = page.getByRole("group", { name: `${cancelledName} at ${venueName}` });
    await expect(card).toBeVisible();

    // 1. The visible "Cancelled" label is present — the accessible carrier.
    await expect(card.getByText("Cancelled")).toBeVisible();

    // Structural assertion, not just text: the name must be wrapped in a
    // real <s> element. A CSS-only line-through (text-decoration, no <s>)
    // would produce identical VISIBLE text but is invisible to a screen
    // reader — a text-only assertion here would pass on both the correct
    // and the broken implementation.
    await expect(card.locator("s")).toHaveText(cancelledName);

    // 2. Not selectable: no Add/Remove-to-route button on the cancelled
    // card, even though the event is otherwise interactive (see the
    // scheduled comparison band below).
    await expect(card.getByRole("button", { name: /route/i })).toHaveCount(0);

    // 3. No live/soon time math leaks through, even though 19:15 sits
    // squarely inside this set's window.
    await expect(card.getByText("Live Now")).toHaveCount(0);
    await expect(card.getByText(/Starts in \d+m/)).toHaveCount(0);

    // Comparison baseline: the scheduled (non-cancelled) band on the SAME
    // page still renders normally — proves the suppression is scoped to
    // is_cancelled, not a global regression that silences every card.
    await expect(page.getByText(scheduledName).first()).toBeVisible();
  });

  test("axe finds zero violations on a page showing a cancelled set", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { slug, today, venueName, cancelledName } = await seedEventWithCancelledSet(page, suffix);

    await page.clock.setFixedTime(localInstant(today, 19, 15));
    await page.goto(`/event/${slug}`);

    const card = page.getByRole("group", { name: `${cancelledName} at ${venueName}` });
    await expect(card).toBeVisible();
    await expect(card.getByText("Cancelled")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .include('[role="group"]')
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  for (const theme of THEMES) {
    test(`the Cancelled pill and struck-through name are legible on ${theme}`, async ({ page }) => {
      await page.addInitScript(
        ({ key, value }) => {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Private browsing / storage unavailable — falls back to the
            // default theme, which is exercised by the midnight-ember run.
          }
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );

      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${theme}`;
      const { slug, today, venueName, cancelledName } = await seedEventWithCancelledSet(page, suffix);

      await page.clock.setFixedTime(localInstant(today, 19, 15));
      await page.goto(`/event/${slug}`);

      const card = page.getByRole("group", { name: `${cancelledName} at ${venueName}` });
      await expect(card).toBeVisible();
      await expect(card.getByText("Cancelled")).toBeVisible();
      await expect(card.locator("s")).toHaveText(cancelledName);

      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).include('[role="group"]').analyze();

      expect(
        results.violations,
        `Color-contrast violations on ${theme} cancelled card:\n${JSON.stringify(results.violations, null, 2)}`,
      ).toEqual([]);
    });
  }
});
