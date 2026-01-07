
import { test, expect } from '@playwright/test';

test.describe('Admin Login', () => {
  test('should allow admin to login', async ({ page }) => {
    // Go to admin login page
    await page.goto('/admin/login');

    // Check if we are on the login page
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();

    // Fill in credentials (using default admin credentials from seed/docs)
    await page.fill('input[type="email"]', 'admin@pinklemonaderecords.com');
    await page.fill('input[type="password"]', 'admin123');

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

    await page.fill('input[type="email"]', 'admin@pinklemonaderecords.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
