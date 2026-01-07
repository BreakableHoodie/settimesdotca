import { test, expect } from '@playwright/test';

test.describe('Event Creation', () => {
  // Setup: Login as admin before each test
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="email"]', 'admin@pinklemonaderecords.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('should allow admin to create a new event', async ({ page }) => {
    // Navigate to Events tab
    await page.click('button:has-text("Events")');

    // Click "Add Event" button
    await page.click('button:has-text("Add Event")');

    // Verify event form modal is visible
    await expect(page.getByRole('heading', { name: 'Add Event' })).toBeVisible();

    // Fill in event details
    await page.fill('input[name="title"]', 'Test Event');
    await page.fill('input[name="date"]', '2026-10-15');
    await page.fill('input[name="startTime"]', '20:00');
    await page.fill('input[name="endTime"]', '23:00');

    // Select venue from dropdown
    await page.click('select[name="venueId"]');
    await page.selectOption('select[name="venueId"]', { index: 1 });

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Event")');

    // Verify event appears in events list
    await expect(page.getByText('Test Event')).toBeVisible();
    await expect(page.getByText('2026-10-15')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Navigate to Events tab
    await page.click('button:has-text("Events")');

    // Click "Add Event" button
    await page.click('button:has-text("Add Event")');

    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Create Event")');

    // Verify validation errors appear
    await expect(page.getByText('Title is required')).toBeVisible();
    await expect(page.getByText('Date is required')).toBeVisible();
  });

  test('should allow admin to publish an event', async ({ page }) => {
    // Navigate to Events tab
    await page.click('button:has-text("Events")');

    // Click "Add Event" button
    await page.click('button:has-text("Add Event")');

    // Fill in event details
    await page.fill('input[name="title"]', 'Published Event');
    await page.fill('input[name="date"]', '2026-10-20');
    await page.fill('input[name="startTime"]', '19:00');
    await page.fill('input[name="endTime"]', '22:00');
    await page.selectOption('select[name="venueId"]', { index: 1 });

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Event")');

    // Find the created event and click publish
    await page.click('button[aria-label="Publish Published Event"]');

    // Verify publish confirmation
    await expect(page.getByText('Event published successfully')).toBeVisible();

    // Verify event shows as published
    await expect(page.getByText('Published')).toBeVisible();
  });

  test('should show error when creating event with past date', async ({ page }) => {
    // Navigate to Events tab
    await page.click('button:has-text("Events")');

    // Click "Add Event" button
    await page.click('button:has-text("Add Event")');

    // Fill in event with past date
    await page.fill('input[name="title"]', 'Past Event');
    await page.fill('input[name="date"]', '2020-01-01');
    await page.fill('input[name="startTime"]', '20:00');
    await page.fill('input[name="endTime"]', '23:00');
    await page.selectOption('select[name="venueId"]', { index: 1 });

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Event")');

    // Verify error message
    await expect(page.getByText('Event date cannot be in the past')).toBeVisible();
  });

  test('should allow admin to edit an event', async ({ page }) => {
    // Navigate to Events tab
    await page.click('button:has-text("Events")');

    // Create event first
    await page.click('button:has-text("Add Event")');
    await page.fill('input[name="title"]', 'Editable Event');
    await page.fill('input[name="date"]', '2026-10-25');
    await page.fill('input[name="startTime"]', '20:00');
    await page.fill('input[name="endTime"]', '23:00');
    await page.selectOption('select[name="venueId"]', { index: 1 });
    await page.click('button[type="submit"]:has-text("Create Event")');

    // Click edit button
    await page.click('button[aria-label="Edit Editable Event"]');

    // Verify edit form opens
    await expect(page.getByRole('heading', { name: 'Edit Event' })).toBeVisible();

    // Update event title
    await page.fill('input[name="title"]', 'Updated Event Title');

    // Submit changes
    await page.click('button[type="submit"]:has-text("Update Event")');

    // Verify updated event appears
    await expect(page.getByText('Updated Event Title')).toBeVisible();
    await expect(page.getByText('Event updated successfully')).toBeVisible();
  });

  test('should allow admin to delete an event', async ({ page }) => {
    // Navigate to Events tab
    await page.click('button:has-text("Events")');

    // Create event first
    await page.click('button:has-text("Add Event")');
    await page.fill('input[name="title"]', 'Deletable Event');
    await page.fill('input[name="date"]', '2026-10-30');
    await page.fill('input[name="startTime"]', '20:00');
    await page.fill('input[name="endTime"]', '23:00');
    await page.selectOption('select[name="venueId"]', { index: 1 });
    await page.click('button[type="submit"]:has-text("Create Event")');

    // Click delete button
    await page.click('button[aria-label="Delete Deletable Event"]');

    // Confirm deletion
    await page.click('button:has-text("Confirm Delete")');

    // Verify event is removed
    await expect(page.getByText('Deletable Event')).not.toBeVisible();
    await expect(page.getByText('Event deleted successfully')).toBeVisible();
  });
});
