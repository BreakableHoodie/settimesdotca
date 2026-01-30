import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './credentials';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Admin Login', () => {
  test('should allow admin to login', async ({ page }) => {
    // Go to admin login page
    await page.goto('/admin/login');

    // Check if we are on the login page
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();

    // Fill in credentials (from environment)
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);

    // Click login button
    await page.click('button[type="submit"]');

    // Should redirect to admin panel
    await expect(page).toHaveURL(/\/admin$/);
    
    // Should see the admin header
    await expect(page.getByText('SetTimes')).toBeVisible();
    await expect(page.getByText('Admin')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/admin/login');

    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
