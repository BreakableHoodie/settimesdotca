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

const openUsersTab = async (page) => {
  await page.click('button:has-text("Users")');
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
};

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const clickAndAcceptDialog = async (page, selector, matcher) => {
  const dialogPromise = page.waitForEvent('dialog');
  await page.click(selector);
  const dialog = await dialogPromise;
  expect(dialog.message()).toMatch(matcher);
  await dialog.accept();
};
const waitForCreateUserForm = async (page) => {
  await expect(page.getByRole('heading', { name: 'Create New User' })).toBeVisible();
  await expect(page.locator('#email')).toHaveValue('');
  await page.waitForTimeout(50);
};
const waitForEditUserForm = async (page, email) => {
  await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();
  await expect(page.locator('#email')).toHaveValue(email);
  await page.waitForTimeout(50);
};

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should allow admin to create a new user', async ({ page }) => {
    const suffix = uniqueSuffix();
    const name = `Test User ${suffix}`;
    const email = `testuser${suffix}@example.com`;
    await openUsersTab(page);
    await page.click('button:has-text("Add User")');

    await waitForCreateUserForm(page);

    await page.fill('#name', name);
    await page.fill('#email', email);
    await page.fill('#password', 'Password1234!');
    await page.selectOption('#role', 'editor');

    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Create User")', /created successfully/i);

    await page.reload();
    await openUsersTab(page);
    const row = page.locator('table tbody tr', { hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(name);
    await expect(row).toContainText(/editor/i);
  });

  test('should validate required user fields', async ({ page }) => {
    await openUsersTab(page);
    await page.click('button:has-text("Add User")');

    await page.click('button[type="submit"]:has-text("Create User")');

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Display name is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test.skip('should validate password confirmation match', async ({ page }) => {
    // Password confirmation is no longer part of the user form.
    await openUsersTab(page);
  });

  test('should allow admin to assign different user roles', async ({ page }) => {
    const adminSuffix = uniqueSuffix();
    const adminName = `Admin User ${adminSuffix}`;
    const adminEmail = `adminuser${adminSuffix}@example.com`;
    const viewerSuffix = uniqueSuffix();
    const viewerName = `Viewer User ${viewerSuffix}`;
    const viewerEmail = `vieweruser${viewerSuffix}@example.com`;
    await openUsersTab(page);

    await page.click('button:has-text("Add User")');
    await waitForCreateUserForm(page);
    await page.fill('#name', adminName);
    await page.fill('#email', adminEmail);
    await page.fill('#password', 'Password1234!');
    await page.selectOption('#role', 'admin');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Create User")', /created successfully/i);

    await page.reload();
    await openUsersTab(page);
    const adminRow = page.locator('table tbody tr', { hasText: adminEmail }).first();
    await expect(adminRow).toBeVisible({ timeout: 15000 });
    await expect(adminRow).toContainText(adminName);
    await expect(adminRow).toContainText(/admin/i);

    await page.click('button:has-text("Add User")');
    await waitForCreateUserForm(page);
    await page.fill('#name', viewerName);
    await page.fill('#email', viewerEmail);
    await page.fill('#password', 'Password1234!');
    await page.selectOption('#role', 'viewer');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Create User")', /created successfully/i);

    await page.reload();
    await openUsersTab(page);
    const viewerRow = page.locator('table tbody tr', { hasText: viewerEmail }).first();
    await expect(viewerRow).toBeVisible({ timeout: 15000 });
    await expect(viewerRow).toContainText(viewerName);
    await expect(viewerRow).toContainText(/viewer/i);
  });

  test('should allow admin to edit user details', async ({ page }) => {
    const suffix = uniqueSuffix();
    const name = `Editable User ${suffix}`;
    const email = `edituser${suffix}@example.com`;
    const updatedName = `Updated User ${suffix}`;
    await openUsersTab(page);

    await page.click('button:has-text("Add User")');
    await waitForCreateUserForm(page);
    await page.fill('#name', name);
    await page.fill('#email', email);
    await page.fill('#password', 'Password1234!');
    await page.selectOption('#role', 'editor');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Create User")', /created successfully/i);

    await page.reload();
    await openUsersTab(page);
    const editRow = page.locator('table tbody tr', { hasText: email }).first();
    await expect(editRow).toBeVisible({ timeout: 15000 });
    await editRow.locator('button[title="Edit User"]').click();
    await waitForEditUserForm(page, email);

    await page.fill('#name', updatedName);
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Update User")', /updated successfully/i);

    const updatedRow = page.locator('table tbody tr', { hasText: email }).first();
    await expect(updatedRow).toContainText(updatedName);
  });
});
