import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils/session";

const openUsersTab = async (page) => {
  await page.click('button:has-text("Users")');
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
};

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
// Invite/update flows show a toast (email delivered) or keep the modal open
// with a URL-copy view (email delivery failed). Both cases are handled here.
const clickAndWaitForToast = async (page, selector, matcher) => {
  await page.click(selector);
  await expect(page.locator("body")).toContainText(matcher, { timeout: 10000 });
  // If email delivery failed the modal stays open showing the invite URL.
  // Close it so subsequent test steps are not blocked by the overlay.
  const inviteCreatedHeading = page.getByRole("heading", { name: "Invite Created" });
  if (await inviteCreatedHeading.isVisible()) {
    await page.getByRole("button", { name: "Close" }).click();
    await expect(inviteCreatedHeading).not.toBeVisible();
  }
};
const waitForCreateUserForm = async (page) => {
  await expect(page.getByRole("heading", { name: "Create New User" })).toBeVisible();
  await expect(page.locator("#email")).toHaveValue("");
  await page.waitForTimeout(50);
};
const waitForEditUserForm = async (page, email) => {
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
  await expect(page.locator("#email")).toHaveValue(email);
  await page.waitForTimeout(50);
};

test.describe("User Management", () => {
  // Tests mutate shared seeded accounts — serialize to prevent parallel races
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("should allow admin to create a new user", async ({ page }) => {
    const suffix = uniqueSuffix();
    const firstName = "Test";
    const lastName = `User ${suffix}`;
    const email = `testuser${suffix}@example.com`;
    await openUsersTab(page);
    await page.click('button:has-text("Invite User")');

    await waitForCreateUserForm(page);

    await page.fill("#firstName", firstName);
    await page.fill("#lastName", lastName);
    await page.fill("#email", email);
    await page.selectOption("#role", "editor");

    // Invite flow: creates an invite code, not a user row.
    // The user appears in the table only after they complete signup via the invite link.
    await clickAndWaitForToast(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);
  });

  test("should validate required user fields", async ({ page }) => {
    await openUsersTab(page);
    await page.click('button:has-text("Invite User")');

    await page.click('button[type="submit"]:has-text("Send Invite")');

    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("First name is required")).toBeVisible();
    await expect(page.getByText("Last name is required")).toBeVisible();
  });

  test.skip("should validate password confirmation match", async ({ page }) => {
    // Password confirmation is no longer part of the user form.
    await openUsersTab(page);
  });

  test("should allow admin to assign different user roles", async ({ page }) => {
    const adminSuffix = uniqueSuffix();
    const adminEmail = `adminuser${adminSuffix}@example.com`;
    const viewerSuffix = uniqueSuffix();
    const viewerEmail = `vieweruser${viewerSuffix}@example.com`;
    await openUsersTab(page);

    // Invite admin-role user
    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill("#firstName", "Admin");
    await page.fill("#lastName", `User ${adminSuffix}`);
    await page.fill("#email", adminEmail);
    await page.selectOption("#role", "admin");
    await clickAndWaitForToast(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);

    // Invite viewer-role user
    await page.click('button:has-text("Invite User")');
    await waitForCreateUserForm(page);
    await page.fill("#firstName", "Viewer");
    await page.fill("#lastName", `User ${viewerSuffix}`);
    await page.fill("#email", viewerEmail);
    await page.selectOption("#role", "viewer");
    await clickAndWaitForToast(page, 'button[type="submit"]:has-text("Send Invite")', /invite (sent|created)/i);
  });

  test("should allow admin to edit user details", async ({ page }) => {
    // Use the seeded viewer user — invite flow does not create a user row until
    // the invitee completes signup, so we edit an already-existing account.
    const email = "viewer@settimes.ca";
    const updatedFirstName = "Updated";
    const updatedLastName = "ViewUser";
    await openUsersTab(page);

    const editRow = page.locator("table tbody tr", { hasText: email }).first();
    await expect(editRow).toBeVisible({ timeout: 15000 });
    await editRow.locator('button[aria-label^="Edit"]').click();
    await waitForEditUserForm(page, email);

    await page.fill("#firstName", updatedFirstName);
    await page.fill("#lastName", updatedLastName);
    await clickAndWaitForToast(page, 'button[type="submit"]:has-text("Update User")', /updated successfully/i);

    const updatedRow = page.locator("table tbody tr", { hasText: email }).first();
    await expect(updatedRow).toContainText(`${updatedFirstName} ${updatedLastName}`);
  });

  test("should show delete confirm dialog and allow cancellation", async ({ page }) => {
    const email = "viewer@settimes.ca";
    await openUsersTab(page);

    const row = page.locator("table tbody tr", { hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 15000 });

    await row.locator('button[aria-label^="Delete"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Delete User");

    // Cancel — user should still be in the table
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(row).toBeVisible();
  });

  test("should show toggle confirm dialog and complete deactivate/reactivate cycle", async ({ page }) => {
    const email = "viewer@settimes.ca";
    await openUsersTab(page);

    const row = page.locator("table tbody tr", { hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 15000 });

    // Deactivate
    await row.locator('button[aria-label^="Deactivate"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Deactivate User");
    await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(page.locator("body")).toContainText(/deactivated/i, { timeout: 10000 });

    // Full page reload flushes wrangler D1 local write-through and guarantees fresh DB state.
    // Fast tab navigation (previous approach) races the miniflare SQLite commit.
    await loginAsAdmin(page);
    await openUsersTab(page);

    // DB-backed state: user is now inactive — Activate button is deterministically present.
    const deactivatedRow = page.locator("table tbody tr", { hasText: email }).first();
    await expect(deactivatedRow).toBeVisible({ timeout: 15000 });
    await deactivatedRow.locator('button[aria-label^="Activate"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Activate User");
    await page.getByRole("dialog").getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("body")).toContainText(/activated/i, { timeout: 10000 });
  });
});
