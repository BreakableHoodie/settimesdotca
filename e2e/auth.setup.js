import fs from 'fs';
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './credentials';

const storageStatePath = 'e2e/.auth/admin.json';

test('authenticate admin and save storage state', async ({ page }) => {
  fs.mkdirSync('e2e/.auth', { recursive: true });

  await page.goto('/admin/login');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().storageState({ path: storageStatePath });
});
