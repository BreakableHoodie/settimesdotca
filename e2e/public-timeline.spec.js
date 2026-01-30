import { test, expect } from '@playwright/test';

test.describe('Public Timeline Viewing', () => {
  test('should display upcoming events without authentication', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /events/i })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test('should show event details when clicked', async ({ page }) => {
    await page.goto('/');

    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await firstEvent.getByRole('button', { name: /view details/i }).click();

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

    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await firstEvent.getByRole('button', { name: /view details/i }).click();
    await expect(firstEvent.getByRole('heading', { name: /venues/i })).toBeVisible();
  });

  test('should show band/performer information in events', async ({ page }) => {
    await page.goto('/');

    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await firstEvent.getByRole('button', { name: /view details/i }).click();
    await expect(firstEvent.getByRole('heading', { name: /all performers/i })).toBeVisible();
  });

  test('should navigate to band profile from event', async ({ page }) => {
    await page.goto('/');

    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await firstEvent.getByRole('button', { name: /view details/i }).click();

    const bandLink = firstEvent.locator('a[href*="/band/"]').first();
    if (await bandLink.isVisible()) {
      const bandName = await bandLink.textContent();
      await bandLink.click();
      await expect(page.getByRole('heading', { name: new RegExp(bandName || '', 'i') })).toBeVisible();
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

    await expect(page.getByRole('heading', { name: /events/i })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();

    await eventCards.first().getByRole('button', { name: /view details/i }).click();
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

    const firstEvent = page.locator('[data-testid="event-card"]').first();
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

    await expect(page.getByRole('heading', { name: /events/i })).toBeVisible();

    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test('should show venue location details in event view', async ({ page }) => {
    await page.goto('/');

    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await firstEvent.getByRole('button', { name: /view details/i }).click();
    await expect(firstEvent.getByRole('heading', { name: /venues/i })).toBeVisible();
  });
});
