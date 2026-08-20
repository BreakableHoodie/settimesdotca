import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils/session";

/**
 * Live-experience lifecycle walkthrough (#554).
 *
 * Seeds a published event dated TODAY (doors 4:00 PM, two evening sets) via
 * the admin API, then drives the fan event page through the full lifecycle
 * at simulated clock times on a mobile viewport:
 *
 *   10:00 → "Upcoming" + doors chip   (pre-doors: start-edge gate, #569)
 *   16:30 → "Live Tonight"            (doors passed, first set still ahead)
 *   19:20 → NextMove "watching"       (set 1 playing: time left + queued set 2)
 *   next-day 09:00 → "Recap"          (+ My Route's wrapped-up empty state)
 *
 * The clock is the BROWSER's (page.clock) — every asserted surface
 * (liveLabel badge, LiveContextBar, NextMove, My Route) derives from the
 * client clock + the schedule payload, so no server-side time mocking is
 * needed. Dates are derived from the test machine's local day so the spec is
 * timezone-agnostic (CI runs UTC, dev machines run Eastern — both
 * self-consistent).
 */

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const getCsrfToken = async (page) => {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "csrf_token")?.value;
};

const apiGet = async (page, url) => {
  const response = await page.request.get(url);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const apiPost = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const headers = csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  const response = await page.request.post(url, { data, headers });
  expect(response.ok(), `POST ${url} → ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

// Local calendar date (YYYY-MM-DD) — the same "today" the browser clock mock
// will report, so isSameLocalDay() holds regardless of the machine timezone.
const localToday = () => new Date().toLocaleDateString("en-CA");

// A local-time instant on a YYYY-MM-DD day. Numeric constructor on purpose —
// never new Date('YYYY-MM-DD...') strings (UTC-parse drift, see CLAUDE.md).
const localInstant = (dateStr, hours, minutes = 0) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, hours, minutes);
};

const nextLocalDay = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return next.toLocaleDateString("en-CA");
};

test.describe("Live experience — lifecycle walkthrough at simulated times (#554)", () => {
  test("Upcoming → Live Tonight → mid-set → Recap", async ({ page }) => {
    const suffix = uniqueSuffix();
    const today = localToday();
    const slug = `live-walkthrough-${suffix}`;

    // Admin login + seeding at desktop (the admin panel isn't reliable at
    // mobile width); the fan-facing phases run at a phone viewport below.
    await loginAsAdmin(page);

    // ── Seed: published event dated today, doors 16:00, two evening sets ──
    const created = await apiPost(page, "/api/admin/events", {
      name: `Live Walkthrough ${suffix}`,
      slug,
      date: today,
      city: "Waterloo, ON",
      doors_json: JSON.stringify({ [today]: "16:00" }),
    });
    const eventId = created.event?.id ?? created.id;
    expect(eventId).toBeTruthy();

    const venuesData = await apiGet(page, "/api/admin/venues");
    const venue = venuesData.venues?.[0];
    expect(venue).toBeTruthy();

    await apiPost(page, "/api/admin/bands", {
      eventId,
      venueId: venue.id,
      name: `Walkthrough Openers ${suffix}`,
      startTime: "19:15",
      endTime: "19:45",
    });
    await apiPost(page, "/api/admin/bands", {
      eventId,
      venueId: venue.id,
      name: `Walkthrough Headliner ${suffix}`,
      startTime: "20:00",
      endTime: "20:30",
    });

    await apiPost(page, `/api/admin/events/${eventId}/publish`, { publish: true });

    const eventPage = `/event/${slug}`;

    // Phone viewport for the fan-facing lifecycle — "works flawlessly on a phone".
    await page.setViewportSize({ width: 390, height: 844 });

    // ── Phase A: 10:00, before doors — Upcoming, doors chip visible ──
    await page.clock.setFixedTime(localInstant(today, 10, 0));
    await page.goto(eventPage);
    await expect(page.getByText(`Walkthrough Openers ${suffix}`)).toBeVisible();
    await expect(page.getByText("Upcoming", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Doors 4:00 PM").first()).toBeVisible();

    // Build a route for the night (persists in localStorage across reloads) —
    // this arms the NextMove live companion asserted in Phase C.
    await page.getByRole("button", { name: `Add Walkthrough Openers ${suffix} to my route` }).click();
    await page.getByRole("button", { name: `Add Walkthrough Headliner ${suffix} to my route` }).click();

    // ── Phase B: 16:30, doors passed but first set (19:15) still ahead ──
    await page.clock.setFixedTime(localInstant(today, 16, 30));
    await page.reload();
    await expect(page.getByText(`Walkthrough Openers ${suffix}`)).toBeVisible();
    await expect(page.getByText("Live Tonight", { exact: true }).first()).toBeVisible();

    // ── Phase C: 19:20, set 1 playing — the NextMove live companion reads
    // the room: watching state with time-left and the queued next set. ──
    await page.clock.setFixedTime(localInstant(today, 19, 20));
    await page.reload();
    await expect(page.getByText("Live Tonight", { exact: true }).first()).toBeVisible();
    // Set 1 runs 19:15–19:45 → 25 min left at 19:20; set 2 starts 20:00 → 40 min out.
    await expect(page.getByText("25 min left", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(`Then Walkthrough Headliner ${suffix} in 40 min`).first()).toBeVisible();

    // ── Phase D: next morning — Recap (within the 48h grace window). Past
    // sets are hidden from the lineup by default, so anchor on the event
    // header rather than a band name. ──
    await page.clock.setFixedTime(localInstant(nextLocalDay(today), 9, 0));
    await page.reload();
    await expect(page.getByText("Recap", { exact: true }).first()).toBeVisible();
    // My Route's morning-after empty state: everything caught, nothing missed.
    await expect(page.getByText("All your selected bands have wrapped up")).toBeVisible();
  });
});
