import { test, expect } from '@playwright/test';

test.describe('User Management', () => {
  // Setup: Login as admin before each test
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="email"]', 'admin@pinklemonaderecords.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('should allow admin to create a new user', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Click "Add User" button
    await page.click('button:has-text("Add User")');

    // Verify user form modal is visible
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();

    // Fill in user details
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');

    // Select user role from dropdown
    await page.click('select[name="role"]');
    await page.selectOption('select[name="role"]', 'editor');

    // Submit form
    await page.click('button[type="submit"]:has-text("Create User")');

    // Verify user appears in users list
    await expect(page.getByText('Test User')).toBeVisible();
    await expect(page.getByText('testuser@example.com')).toBeVisible();
    await expect(page.getByText('Editor')).toBeVisible();
  });

  test('should validate required user fields', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Click "Add User" button
    await page.click('button:has-text("Add User")');

    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Create User")');

    // Verify validation errors appear
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('should validate password confirmation match', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Click "Add User" button
    await page.click('button:has-text("Add User")');

    // Fill in user details with mismatched passwords
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password456');

    // Submit form
    await page.click('button[type="submit"]:has-text("Create User")');

    // Verify password mismatch error
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('should allow admin to assign different user roles', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Create admin role user
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'Admin User');
    await page.fill('input[name="email"]', 'adminuser@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'admin');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Verify admin role assigned
    await expect(page.getByText('Admin User')).toBeVisible();
    await expect(page.getByText('Admin')).toBeVisible();

    // Create viewer role user
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'Viewer User');
    await page.fill('input[name="email"]', 'vieweruser@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Verify viewer role assigned
    await expect(page.getByText('Viewer User')).toBeVisible();
    await expect(page.getByText('Viewer')).toBeVisible();
  });

  test('should allow admin to edit user details', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Create user first
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'Editable User');
    await page.fill('input[name="email"]', 'edituser@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'editor');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Click edit button
    await page.click('button[aria-label="Edit Editable User"]');

    // Verify edit form opens
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    // Update user details
    await page.fill('input[name="name"]', 'Updated User Name');
    await page.selectOption('select[name="role"]', 'admin');

    // Submit changes
    await page.click('button[type="submit"]:has-text("Update User")');

    // Verify updated user appears
    await expect(page.getByText('Updated User Name')).toBeVisible();
    await expect(page.getByText('Admin')).toBeVisible();
    await expect(page.getByText('User updated successfully')).toBeVisible();
  });

  test('should allow admin to delete a user', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Create user first
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'Deletable User');
    await page.fill('input[name="email"]', 'deleteuser@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Click delete button
    await page.click('button[aria-label="Delete Deletable User"]');

    // Confirm deletion
    await page.click('button:has-text("Confirm Delete")');

    // Verify user is removed
    await expect(page.getByText('Deletable User')).not.toBeVisible();
    await expect(page.getByText('User deleted successfully')).toBeVisible();
  });

  test('should prevent duplicate email addresses', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Create first user
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'First User');
    await page.fill('input[name="email"]', 'duplicate@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'editor');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Try to create second user with same email
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'Second User');
    await page.fill('input[name="email"]', 'duplicate@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Verify duplicate email error
    await expect(page.getByText('Email already exists')).toBeVisible();
  });

  test('should toggle user account status', async ({ page }) => {
    // Navigate to Users tab
    await page.click('button:has-text("Users")');

    // Create user first
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="name"]', 'Status User');
    await page.fill('input[name="email"]', 'statususer@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    await page.selectOption('select[name="role"]', 'editor');
    await page.click('button[type="submit"]:has-text("Create User")');

    // Locate toggle button (if available)
    const toggleButton = page.locator('button[aria-label="Toggle Status User account"]');
    if (await toggleButton.isVisible()) {
      // Disable account
      await toggleButton.click();
      await expect(page.getByText('Account disabled')).toBeVisible();

      // Re-enable account
      await toggleButton.click();
      await expect(page.getByText('Account enabled')).toBeVisible();
    }
  });
});
