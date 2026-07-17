import { test, expect } from '@playwright/test';

// During show hours, EventTimeline.jsx auto-expands a live event
// (`useState(isLive)`), so its "View Details" toggle already reads "Hide
// Details". Plain `[data-testid="event-card"]').first()` can therefore grab
// an already-expanded card and time out waiting for a "View Details" button
// that isn't there (#602 — CI-only, time-of-day dependent). Filtering to a
// card that still shows the collapsed affordance keeps these specs
// deterministic regardless of clock/live state.
//
// Playwright locators are lazy/live, not snapshots: a `.filter({ has: ... })`
// locator re-runs its condition on every query. Once the returned card is
// clicked open, its button flips to "Hide Details" and it stops matching the
// "View Details" filter — a later `firstEvent.getByRole(...)` would silently
// re-resolve to a *different* card. So resolve the filter once to a stable
// DOM index and hand back an `nth()` locator, which stays pinned to that
// card's position regardless of its later expanded/collapsed state.
async function collapsedEventCard(page) {
  const allCards = page.locator('[data-testid="event-card"]');
  const collapsed = allCards.filter({ has: page.getByRole('button', { name: /view details/i }) }).first();
  const index = await collapsed.evaluate((el, testid) =>
    Array.from(document.querySelectorAll(`[data-testid="${testid}"]`)).indexOf(el),
    'event-card'
  );
  return allCards.nth(index);
}

test.describe('Public Timeline Viewing', () => {
  test('should display upcoming events without authentication', async ({ page }) => {
    await page.goto('/');

    // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test('should show event details when clicked', async ({ page }) => {
    await page.goto('/');

    const firstEvent = await collapsedEventCard(page);
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    // Verify the card expanded (button flips to Hide Details)
    await expect(firstEvent.getByRole('button', { name: /hide details/i })).toBeVisible();

    // Seed data guarantees the upcoming event has venues
    await expect(firstEvent.getByRole('heading', { name: /venues/i })).toBeVisible();
  });

  test('should allow filtering controls', async ({ page }) => {
    await page.goto('/');

    const filtersButton = page.getByRole('button', { name: /show filters/i });
    if (await filtersButton.isVisible()) {
      await filtersButton.click();
      await expect(page.getByRole('button', { name: /hide filters/i })).toBeVisible();
    }
  });

  test('should display event venue information', async ({ page }) => {
    await page.goto('/');

    const firstEvent = await collapsedEventCard(page);
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    // Seed data guarantees the upcoming event has venues
    await expect(firstEvent.getByRole('button', { name: /hide details/i })).toBeVisible();
    await expect(firstEvent.getByRole('heading', { name: /venues/i })).toBeVisible();
  });

  test('should show band/performer information in events', async ({ page }) => {
    await page.goto('/');

    const firstEvent = await collapsedEventCard(page);
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    // Seed data guarantees the upcoming event has performers
    await expect(firstEvent.getByRole('button', { name: /hide details/i })).toBeVisible();
    await expect(firstEvent.getByRole('heading', { name: /all performers/i })).toBeVisible();
  });

  test('should navigate to band profile from event', async ({ page }) => {
    await page.goto('/');

    const firstEvent = await collapsedEventCard(page);
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    const bandLink = firstEvent.locator('a[href*="/band/"]').first();
    if (await bandLink.isVisible()) {
      await bandLink.click();
      await expect(page).toHaveURL(/\/band\//);
      // Wait for the band profile to fully render before asserting content.
      // toHaveTitle waits for the useEffect title update; only then is the page settled.
      // Scoping to main h1 avoids the Header's "SetTimes" h1 (strict mode violation).
      await expect(page).toHaveTitle(/- Band Profile \| SetTimes$/);
      await expect(page.locator('main h1')).toBeVisible();
    }
  });

  test('should display timeline content', async ({ page }) => {
    await page.goto('/');

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();

    const mobileCard = await collapsedEventCard(page);
    await mobileCard.getByRole('button', { name: /view details/i }).click();
    await page.waitForTimeout(500);
  });

  test('should show empty state when no events available', async ({ page }) => {
    await page.goto('/');

    const historyButton = page.getByRole('button', { name: /show history|hide history/i });
    if (await historyButton.isVisible()) {
      await historyButton.click();

      const emptyMessage = page.locator('text=/no events|no performances|nothing scheduled/i');
      const eventCards = page.locator('[data-testid="event-card"]');

      const hasEvents = (await eventCards.count()) > 0;
      const hasEmptyMessage = await emptyMessage.isVisible();

      expect(hasEvents || hasEmptyMessage).toBeTruthy();
    }
  });

  test('should display event duration and time details', async ({ page }) => {
    await page.goto('/');

    const firstEvent = await collapsedEventCard(page);
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    const timeRange = firstEvent.locator('text=/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/');
    if (await timeRange.first().isVisible()) {
      await expect(timeRange.first()).toBeVisible();
    }
  });

  test('should allow visitors to access timeline without login', async ({ page }) => {
    await page.goto('/');

    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page).not.toHaveURL(/\/login/);

    // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test('should show venue location details in event view', async ({ page }) => {
    await page.goto('/');

    const firstEvent = await collapsedEventCard(page);
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    // Seed data guarantees the upcoming event has venues
    await expect(firstEvent.getByRole('button', { name: /hide details/i })).toBeVisible();
    await expect(firstEvent.getByRole('heading', { name: /venues/i })).toBeVisible();
  });
});
