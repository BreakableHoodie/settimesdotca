import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './credentials';

const loginAsAdmin = async (page) => {
  await page.goto('/admin');
  if (await page.locator('input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false)) {
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

    // Invite flow: creates an invite code, not a user row.
    // The user appears in the table only after they complete signup via the invite link.
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);
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
    const adminEmail = `adminuser${adminSuffix}@example.com`;
    const viewerSuffix = uniqueSuffix();
    const viewerEmail = `vieweruser${viewerSuffix}@example.com`;
    await openUsersTab(page);

    // Invite admin-role user
    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill('#firstName', 'Admin');
    await page.fill('#lastName', `User ${adminSuffix}`);
    await page.fill('#email', adminEmail);
    await page.selectOption('#role', 'admin');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);

    // Invite viewer-role user
    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill('#firstName', 'Viewer');
    await page.fill('#lastName', `User ${viewerSuffix}`);
    await page.fill('#email', viewerEmail);
    await page.selectOption('#role', 'viewer');
    await clickAndAcceptDialog(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);
  });

  test('should allow admin to edit user details', async ({ page }) => {
    // Use the seeded viewer user — invite flow does not create a user row until
    // the invitee completes signup, so we edit an already-existing account.
    const email = 'viewer@settimes.ca';
    const updatedFirstName = 'Updated';
    const updatedLastName = 'ViewUser';
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
