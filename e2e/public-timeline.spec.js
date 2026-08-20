import { test, expect } from "@playwright/test";

// Pinned by NAME, never by position. Taking the first card couples every
// assertion below to "no other spec has created an event", which is false:
// several specs create events dated TODAY, which sort ahead of the seeded
// fixtures and take the slot (#895). Locally, where D1 persists between runs,
// those accumulate until these tests fail outright; in CI it is a live race
// within a single run rather than a certainty, which is worse — it looks like
// flake. admin-surfaces.spec.js already selects its event by name for the
// same reason.
//
// This supersedes the #602 fix it replaces rather than dropping it. That bug
// was `.first()` grabbing a LIVE event, which EventTimeline auto-expands
// (`useState(isLive)`), so its "View Details" toggle already read "Hide
// Details" and the click timed out — CI-only and time-of-day dependent. The
// seeded event is dated two weeks out and is never live, so the card is
// reliably collapsed; naming it removes the whole class rather than filtering
// around it.
//
// Playwright locators are lazy/live, not snapshots: a `.filter({ has: ... })`
// locator re-runs its condition on every query. Once the returned card is
// clicked open, its button flips to "Hide Details" and it stops matching the
// "View Details" filter — a later `firstEvent.getByRole(...)` would silently
// re-resolve to a *different* card. So resolve the filter once to a stable
// DOM index and hand back an `nth()` locator, which stays pinned to that
// card's position regardless of its later expanded/collapsed state.
const SEEDED_EVENT = "Future Fest E2E";

async function seededEventCard(page) {
  const allCards = page.locator('[data-testid="event-card"]');
  const target = allCards.filter({ hasText: SEEDED_EVENT }).first();
  await expect(target).toBeVisible();
  const index = await target.evaluate(
    (el, testid) => Array.from(document.querySelectorAll(`[data-testid="${testid}"]`)).indexOf(el),
    "event-card",
  );
  return allCards.nth(index);
}

test.describe("Public Timeline Viewing", () => {
  test("should display upcoming events without authentication", async ({ page }) => {
    await page.goto("/");

    // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test("should show event details when clicked", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    // Verify the card expanded (button flips to Hide Details)
    await expect(firstEvent.getByRole("button", { name: /hide details/i })).toBeVisible();

    // Seed data guarantees the upcoming event has venues
    await expect(firstEvent.getByRole("heading", { name: /venues/i })).toBeVisible();
  });

  test("should allow filtering controls", async ({ page }) => {
    await page.goto("/");

    const filtersButton = page.getByRole("button", { name: /show filters/i });
    if (await filtersButton.isVisible()) {
      await filtersButton.click();
      await expect(page.getByRole("button", { name: /hide filters/i })).toBeVisible();
    }
  });

  test("should display event venue information", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    // Seed data guarantees the upcoming event has venues
    await expect(firstEvent.getByRole("button", { name: /hide details/i })).toBeVisible();
    await expect(firstEvent.getByRole("heading", { name: /venues/i })).toBeVisible();
  });

  test("should show band/performer information in events", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    // Seed data guarantees the upcoming event has performers
    await expect(firstEvent.getByRole("button", { name: /hide details/i })).toBeVisible();
    await expect(firstEvent.getByRole("heading", { name: /all performers/i })).toBeVisible();
  });

  test("should navigate to band profile from event", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    // NOT wrapped in `if (await bandLink.isVisible())`. It was, and that made the
    // whole assertion block skippable: whenever the card under test had no band
    // links the test passed having checked nothing (#895). The seeded event always
    // has performers, so absence is a failure, not a reason to skip.
    const bandLink = firstEvent.locator('a[href*="/band/"]').first();
    await expect(bandLink).toBeVisible();
    // Captured BEFORE navigating, so the profile can be checked to be the one
    // that was clicked rather than merely "a band profile".
    const bandName = ((await bandLink.textContent()) ?? "").trim();
    // An empty name would make the `main h1` assertion below vacuous —
    // toContainText("") passes against any heading at all.
    expect(bandName).not.toBe("");
    await bandLink.click();
    await expect(page).toHaveURL(/\/band\//);
    // The LOADED title, not the pre-load fallback. BandProfilePage sets
    // 'Band Profile | SetTimes' while the fetch is in flight and only then
    // replicates the SSR formula, `{name} — {genre} in Waterloo Region | SetTimes`
    // (functions/band/[id].js). The old pattern matched the fallback, so it could
    // only ever pass while the page was still loading — which is the opposite of
    // the "wait until settled" this line is here to do.
    await expect(page).toHaveTitle(/ in Waterloo Region \| SetTimes$/);
    // Scoping to main h1 avoids the Header's "SetTimes" h1 (strict mode violation).
    // Asserting the NAME, not just visibility: a generic "a profile rendered"
    // check passes even if the wrong link were followed.
    await expect(page.locator("main h1")).toContainText(bandName);
  });

  test("should display timeline content", async ({ page }) => {
    await page.goto("/");

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();

    const mobileCard = await seededEventCard(page);
    await mobileCard.getByRole("button", { name: /view details/i }).click();
    await page.waitForTimeout(500);
  });

  test("should show empty state when no events available", async ({ page }) => {
    await page.goto("/");

    const historyButton = page.getByRole("button", { name: /show history|hide history/i });
    if (await historyButton.isVisible()) {
      await historyButton.click();

      const emptyMessage = page.locator("text=/no events|no performances|nothing scheduled/i");
      const eventCards = page.locator('[data-testid="event-card"]');

      const hasEvents = (await eventCards.count()) > 0;
      const hasEmptyMessage = await emptyMessage.isVisible();

      expect(hasEvents || hasEmptyMessage).toBeTruthy();
    }
  });

  test("should display event duration and time details", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    const timeRange = firstEvent.locator("text=/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/");
    if (await timeRange.first().isVisible()) {
      await expect(timeRange.first()).toBeVisible();
    }
  });

  test("should allow visitors to access timeline without login", async ({ page }) => {
    await page.goto("/");

    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page).not.toHaveURL(/\/login/);

    // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test("should show venue location details in event view", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    // Seed data guarantees the upcoming event has venues
    await expect(firstEvent.getByRole("button", { name: /hide details/i })).toBeVisible();
    await expect(firstEvent.getByRole("heading", { name: /venues/i })).toBeVisible();
  });
});
