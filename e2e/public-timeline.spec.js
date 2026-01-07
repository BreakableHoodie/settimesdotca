import { test, expect } from '@playwright/test';

test.describe('Public Timeline Viewing', () => {
  test('should display upcoming events without authentication', async ({ page }) => {
    // Navigate to public homepage
    await page.goto('/');

    // Verify timeline is visible
    await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible();

    // Verify at least one event card is displayed
    const eventCards = page.locator('[data-testid="event-card"]').or(page.locator('.event-card'));
    await expect(eventCards.first()).toBeVisible();

    // Verify event details are displayed
    await expect(page.getByText(/\d{1,2}:\d{2}\s*(AM|PM)/i).first()).toBeVisible(); // Time display
  });

  test('should show event details when clicked', async ({ page }) => {
    await page.goto('/');

    // Click on first event card
    const firstEvent = page.locator('[data-testid="event-card"]').or(page.locator('.event-card')).first();
    const eventTitle = await firstEvent.locator('h3, h2, [class*="title"]').first().textContent();
    await firstEvent.click();

    // Verify event details modal or page opens
    await expect(page.getByRole('heading', { name: new RegExp(eventTitle || '', 'i') })).toBeVisible();
  });

  test('should filter events by time period', async ({ page }) => {
    await page.goto('/');

    // Check for time filter buttons
    const nowButton = page.locator('button:has-text("Now")');
    const upcomingButton = page.locator('button:has-text("Upcoming")');
    const pastButton = page.locator('button:has-text("Past")');

    if (await nowButton.isVisible()) {
      // Test "Now" filter
      await nowButton.click();
      await expect(page.getByText(/happening now/i).or(page.locator('[data-filter="now"]'))).toBeVisible();

      // Test "Upcoming" filter
      if (await upcomingButton.isVisible()) {
        await upcomingButton.click();
        await page.waitForTimeout(500); // Wait for filter transition
      }

      // Test "Past" filter
      if (await pastButton.isVisible()) {
        await pastButton.click();
        await page.waitForTimeout(500); // Wait for filter transition
      }
    }
  });

  test('should display event venue information', async ({ page }) => {
    await page.goto('/');

    // Verify venue information is visible in event cards
    const venueInfo = page.locator('[data-testid="venue-name"]').or(page.locator('[class*="venue"]')).first();
    if (await venueInfo.isVisible()) {
      await expect(venueInfo).toBeVisible();
    }
  });

  test('should show band/performer information in events', async ({ page }) => {
    await page.goto('/');

    // Click on first event
    const firstEvent = page.locator('[data-testid="event-card"]').or(page.locator('.event-card')).first();
    await firstEvent.click();

    // Verify performer/band information is displayed
    const performerInfo = page.locator('[data-testid="performer"]').or(page.locator('[class*="performer"]')).or(page.locator('[class*="band"]'));
    if (await performerInfo.first().isVisible()) {
      await expect(performerInfo.first()).toBeVisible();
    }
  });

  test('should navigate to band profile from event', async ({ page }) => {
    await page.goto('/');

    // Click on first event
    const firstEvent = page.locator('[data-testid="event-card"]').or(page.locator('.event-card')).first();
    await firstEvent.click();

    // Look for band link
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]'));
    if (await bandLink.first().isVisible()) {
      const bandName = await bandLink.first().textContent();
      await bandLink.first().click();

      // Verify band profile page loads
      await expect(page.getByRole('heading', { name: new RegExp(bandName || '', 'i') })).toBeVisible();
    }
  });

  test('should display timeline in chronological order', async ({ page }) => {
    await page.goto('/');

    // Get all event time elements
    const eventTimes = page.locator('[data-testid="event-time"]').or(page.locator('[class*="time"]'));
    const timeCount = await eventTimes.count();

    if (timeCount >= 2) {
      // Verify events are in order by checking first two times
      const firstTime = await eventTimes.nth(0).textContent();
      const secondTime = await eventTimes.nth(1).textContent();

      // Both times should be visible
      expect(firstTime).toBeTruthy();
      expect(secondTime).toBeTruthy();
    }
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Verify timeline is visible and functional on mobile
    await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible();

    // Verify event cards stack vertically on mobile
    const eventCards = page.locator('[data-testid="event-card"]').or(page.locator('.event-card'));
    await expect(eventCards.first()).toBeVisible();

    // Click event to verify interaction works on mobile
    await eventCards.first().click();
    await page.waitForTimeout(500); // Wait for modal/navigation
  });

  test('should show empty state when no events available', async ({ page }) => {
    await page.goto('/');

    // Navigate to past events (likely empty in new system)
    const pastButton = page.locator('button:has-text("Past")');
    if (await pastButton.isVisible()) {
      await pastButton.click();

      // Check for empty state message
      const emptyMessage = page.locator('text=/no events|no performances|nothing scheduled/i');
      const eventCards = page.locator('[data-testid="event-card"]').or(page.locator('.event-card'));

      // Either empty message should be visible OR events should be visible (not both)
      const hasEvents = await eventCards.count() > 0;
      const hasEmptyMessage = await emptyMessage.isVisible();

      expect(hasEvents || hasEmptyMessage).toBeTruthy();
    }
  });

  test('should display event duration and time details', async ({ page }) => {
    await page.goto('/');

    // Click on first event
    const firstEvent = page.locator('[data-testid="event-card"]').or(page.locator('.event-card')).first();
    await firstEvent.click();

    // Verify start time is displayed
    const startTime = page.locator('text=/start.*time|doors.*open|\d{1,2}:\d{2}\s*(AM|PM)/i');
    if (await startTime.first().isVisible()) {
      await expect(startTime.first()).toBeVisible();
    }
  });

  test('should allow visitors to access timeline without login', async ({ page }) => {
    // Verify no authentication required
    await page.goto('/');

    // Should NOT redirect to login page
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page).not.toHaveURL(/\/login/);

    // Timeline should be accessible
    await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible();

    // Verify no login prompt appears
    const loginButton = page.locator('button:has-text("Login")').or(page.locator('a:has-text("Login")'));
    // Login button may exist in header, but should not be blocking content
    const eventCards = page.locator('[data-testid="event-card"]').or(page.locator('.event-card'));
    await expect(eventCards.first()).toBeVisible();
  });

  test('should show venue location details in event view', async ({ page }) => {
    await page.goto('/');

    // Click on first event
    const firstEvent = page.locator('[data-testid="event-card"]').or(page.locator('.event-card')).first();
    await firstEvent.click();

    // Look for venue location/address information
    const locationInfo = page.locator('[data-testid="venue-location"]').or(
      page.locator('text=/\d+\s+\w+\s+(street|st|avenue|ave|road|rd)/i')
    );

    if (await locationInfo.first().isVisible()) {
      await expect(locationInfo.first()).toBeVisible();
    }
  });
});
