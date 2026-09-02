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
// Return the live name filter, never a resolved `nth()` index: EventTimeline
// re-polls every 60s and a card moving between the now/upcoming/past buckets
// shifts positions, so a pinned index can end up addressing a different event.
// The name filter is safe to keep live because the name stays in the card
// whether it is collapsed or expanded.
const SEEDED_EVENT = "Future Fest E2E";

async function seededEventCard(page) {
  const card = page.locator('[data-testid="event-card"]').filter({ hasText: SEEDED_EVENT }).first();
  await expect(card).toBeVisible();
  return card;
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
    // that was clicked rather than merely "a band profile". This is the whole
    // CARD's text, not just the name -- the anchor wraps venue, time and genre
    // too ("The Time TravellersWaterloo Music Hall7:00 PM - 7:45 PMIndie Rock"),
    // which is why the comparison below runs link-contains-heading rather than
    // the other way round.
    const linkText = ((await bandLink.textContent()) ?? "").trim();
    // An empty capture would make the comparison below vacuous.
    expect(linkText).not.toBe("");
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
    const heading = page.locator("main h1");
    await expect(heading).toBeVisible();
    const headingText = ((await heading.textContent()) ?? "").trim();
    // Guard both sides: an empty heading would make the containment check pass
    // against anything, which is the vacuity this test was just fixed for.
    expect(headingText).not.toBe("");
    // Identity, not just "a profile rendered" -- that passes even if the wrong
    // link were followed.
    expect(linkText).toContain(headingText);
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

  // Was "should show empty state when no events available", and it never ran a
  // single assertion: it gated on a "Show history"/"Hide history" button that
  // exists nowhere in frontend/src, so isVisible() was always false and the body
  // was skipped every run. The assertion inside could not have failed either --
  // the seed carries 30 public events, so `hasEvents` is always true and
  // `hasEvents || hasEmptyMessage` is a tautology.
  //
  // The empty state it named is genuinely unreachable from this fixture, so it is
  // not re-testable here; EventTimeline's between-seasons empty state is covered
  // by unit tests, which can seed zero events. What IS worth asserting on the
  // real timeline is that seeded events actually render as cards.
  test("renders the seeded events as cards", async ({ page }) => {
    await page.goto("/");

    const eventCards = page.locator('[data-testid="event-card"]');
    // Web-first assertions only: both retry. `expect(await locator.count())`
    // samples once with no auto-wait, so it can read 0 on a slow CI run before
    // the cards render -- a flaky assertion is exactly what this PR removes
    // elsewhere, and it would be careless to add one here.
    await expect(eventCards).not.toHaveCount(0);
    await expect(eventCards.first()).toBeVisible();
  });

  test("should display event duration and time details", async ({ page }) => {
    await page.goto("/");

    const firstEvent = await seededEventCard(page);
    await firstEvent.getByRole("button", { name: /view details/i }).click();

    // Unconditional: all 12 seeded performances carry a start_time and
    // EventTimeline renders formatTimeRange(start, end), so a missing range is a
    // real failure rather than absent optional content.
    // 12-hour with a meridiem, matching formatTimeRange -> formatTime in
    // frontend/src/utils/timeFormat.js ("7:00 PM - 7:45 PM"). The previous
    // pattern required \d{2}:\d{2} on both sides and no AM/PM, so it matched
    // nothing -- which the count() guard silently absorbed.
    const timeRange = firstEvent.locator("text=/\\d{1,2}:\\d{2}\\s*(AM|PM)\\s*-\\s*\\d{1,2}:\\d{2}\\s*(AM|PM)/i");
    await expect(timeRange.first()).toBeVisible();
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
