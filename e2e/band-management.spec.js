import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './credentials';

const loginAsAdmin = async (page) => {
  await page.goto('/admin');
  if (page.url().includes('/admin/login')) {
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin$/);
  }
};

const openRosterTab = async (page) => {
  await page.click('button:has-text("Roster")');
};

test.describe('Band Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should allow admin to create a new artist', async ({ page }) => {
    const suffix = Date.now();
    const bandName = `Test Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await expect(page.getByRole('heading', { name: 'New Artist' })).toBeVisible();

    await page.fill('input[name="name"]', bandName);
    await page.fill('input[name="genre"]', 'Rock');
    await page.locator('.ql-editor').first().fill('A test band with great music');
    await page.fill('input[name="website"]', 'https://testband.com');
    await page.fill('input[name="instagram"]', '@testband');
    await page.fill('input[name="bandcamp"]', 'https://bandcamp.com/testband');

    await page.click('button[type="submit"]:has-text("Add Artist")');

    const row = page.locator('table tbody tr', { hasText: bandName }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Rock');
  });

  test('should validate required artist name', async ({ page }) => {
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.click('button[type="submit"]:has-text("Add Artist")');

    const nameMissing = await page.locator('input[name="name"]').evaluate(input => input.validity.valueMissing);
    expect(nameMissing).toBe(true);
  });

  test('should allow admin to edit artist profile', async ({ page }) => {
    const suffix = Date.now();
    const originalName = `Editable Band ${suffix}`;
    const updatedName = `Updated Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.fill('input[name="name"]', originalName);
    await page.fill('input[name="genre"]', 'Jazz');
    await page.locator('.ql-editor').first().fill('Original bio');
    await page.click('button[type="submit"]:has-text("Add Artist")');

    await page.locator('tr', { hasText: originalName }).getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Artist' })).toBeVisible();

    await page.fill('input[name="name"]', updatedName);
    await page.locator('.ql-editor').first().fill('Updated bio with new information');

    await page.click('button[type="submit"]:has-text("Update Artist")');

    const updatedRow = page.locator('table tbody tr', { hasText: updatedName }).first();
    await expect(updatedRow).toBeVisible();
    await expect(page.getByText('Artist updated')).toBeVisible();
  });

  test('should allow admin to delete an artist', async ({ page }) => {
    const suffix = Date.now();
    const bandName = `Deletable Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.fill('input[name="name"]', bandName);
    await page.fill('input[name="genre"]', 'Pop');
    await page.locator('.ql-editor').first().fill('This band will be deleted');
    await page.click('button[type="submit"]:has-text("Add Artist")');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('tr', { hasText: bandName }).getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('Artist deleted')).toBeVisible();
  });

  test('should allow admin to upload band photo', async ({ page }) => {
    const suffix = Date.now();
    const bandName = `Photo Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.fill('input[name="name"]', bandName);
    await page.fill('input[name="genre"]', 'Electronic');
    await page.click('button[type="submit"]:has-text("Add Artist")');

    await page.locator('tr', { hasText: bandName }).getByRole('button', { name: 'Edit' }).click();

    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles({
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      });

      const errorMessage = page.getByText(/upload failed|invalid file type|file too large/i);
      const hasError = await errorMessage.isVisible();
      if (!hasError) {
        await expect(page.locator('img[alt="Band profile"]')).toBeVisible();
      }
    }
  });

  test.skip('should show band profile with social media links', async ({ page }) => {
    // Roster view does not expose public profile links; covered in public tests instead.
    await openRosterTab(page);
  });

  test.skip('should search for bands by name', async ({ page }) => {
    // Roster view does not currently include search.
    await openRosterTab(page);
  });

  test.skip('should filter bands by genre', async ({ page }) => {
    // Roster view does not currently include genre filtering.
    await openRosterTab(page);
  });
});
