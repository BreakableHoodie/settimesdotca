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
    const firstName = 'Test';
    const lastName = `User ${suffix}`;
    const email = `testuser${suffix}@example.com`;
    await openUsersTab(page);
    await page.click('button:has-text("Invite User")');

    await waitForCreateUserForm(page);

    await page.fill('#firstName', firstName);
    await page.fill('#lastName', lastName);
    await page.fill('#email', email);
    await page.selectOption('#role', 'editor');

    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);

    await page.reload();
    await openUsersTab(page);
    const row = page.locator('table tbody tr', { hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(`${firstName} ${lastName}`);
    await expect(row).toContainText(/editor/i);
  });

  test('should validate required user fields', async ({ page }) => {
    await openUsersTab(page);
    await page.click('button:has-text("Invite User")');

    await page.click('button[type="submit"]:has-text("Send Invite")');

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
  });

  test.skip('should validate password confirmation match', async ({ page }) => {
    // Password confirmation is no longer part of the user form.
    await openUsersTab(page);
  });

  test('should allow admin to assign different user roles', async ({ page }) => {
    const adminSuffix = uniqueSuffix();
    const adminFirstName = 'Admin';
    const adminLastName = `User ${adminSuffix}`;
    const adminEmail = `adminuser${adminSuffix}@example.com`;
    const viewerSuffix = uniqueSuffix();
    const viewerFirstName = 'Viewer';
    const viewerLastName = `User ${viewerSuffix}`;
    const viewerEmail = `vieweruser${viewerSuffix}@example.com`;
    await openUsersTab(page);

    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill('#firstName', adminFirstName);
    await page.fill('#lastName', adminLastName);
    await page.fill('#email', adminEmail);
    await page.selectOption('#role', 'admin');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);

    await page.reload();
    await openUsersTab(page);
    const adminRow = page.locator('table tbody tr', { hasText: adminEmail }).first();
    await expect(adminRow).toBeVisible({ timeout: 15000 });
    await expect(adminRow).toContainText(`${adminFirstName} ${adminLastName}`);
    await expect(adminRow).toContainText(/admin/i);

    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill('#firstName', viewerFirstName);
    await page.fill('#lastName', viewerLastName);
    await page.fill('#email', viewerEmail);
    await page.selectOption('#role', 'viewer');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);

    await page.reload();
    await openUsersTab(page);
    const viewerRow = page.locator('table tbody tr', { hasText: viewerEmail }).first();
    await expect(viewerRow).toBeVisible({ timeout: 15000 });
    await expect(viewerRow).toContainText(`${viewerFirstName} ${viewerLastName}`);
    await expect(viewerRow).toContainText(/viewer/i);
  });

  test('should allow admin to edit user details', async ({ page }) => {
    const suffix = uniqueSuffix();
    const firstName = 'Editable';
    const lastName = `User ${suffix}`;
    const email = `edituser${suffix}@example.com`;
    const updatedFirstName = 'Updated';
    const updatedLastName = `User ${suffix}`;
    await openUsersTab(page);

    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill('#firstName', firstName);
    await page.fill('#lastName', lastName);
    await page.fill('#email', email);
    await page.selectOption('#role', 'editor');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);

    await page.reload();
    await openUsersTab(page);
    const editRow = page.locator('table tbody tr', { hasText: email }).first();
    await expect(editRow).toBeVisible({ timeout: 15000 });
    await editRow.locator('button[title="Edit User"]').click();
    await waitForEditUserForm(page, email);

    await page.fill('#firstName', updatedFirstName);
    await page.fill('#lastName', updatedLastName);
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Update User")', /updated successfully/i);

    const updatedRow = page.locator('table tbody tr', { hasText: email }).first();
    await expect(updatedRow).toContainText(`${updatedFirstName} ${updatedLastName}`);
  });
});
