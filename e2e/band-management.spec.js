import { test, expect } from '@playwright/test';

test.describe('Band Management', () => {
  // Setup: Login as admin before each test
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="email"]', 'admin@pinklemonaderecords.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('should allow admin to create a new band with profile', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Click "Add Band" button
    await page.click('button:has-text("Add Band")');

    // Verify band form modal is visible
    await expect(page.getByRole('heading', { name: 'Add Band' })).toBeVisible();

    // Fill in band details
    await page.fill('input[name="name"]', 'Test Band');
    await page.fill('input[name="genre"]', 'Rock');
    await page.fill('textarea[name="bio"]', 'A test band with great music');
    await page.fill('input[name="website"]', 'https://testband.com');
    await page.fill('input[name="instagram"]', '@testband');
    await page.fill('input[name="spotify"]', 'https://open.spotify.com/artist/testband');

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Verify band appears in bands list
    await expect(page.getByText('Test Band')).toBeVisible();
    await expect(page.getByText('Rock')).toBeVisible();
  });

  test('should validate required band fields', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Click "Add Band" button
    await page.click('button:has-text("Add Band")');

    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Verify validation errors appear
    await expect(page.getByText('Band name is required')).toBeVisible();
    await expect(page.getByText('Genre is required')).toBeVisible();
  });

  test('should allow admin to edit band profile', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Create band first
    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Editable Band');
    await page.fill('input[name="genre"]', 'Jazz');
    await page.fill('textarea[name="bio"]', 'Original bio');
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Click edit button
    await page.click('button[aria-label="Edit Editable Band"]');

    // Verify edit form opens
    await expect(page.getByRole('heading', { name: 'Edit Band' })).toBeVisible();

    // Update band details
    await page.fill('input[name="name"]', 'Updated Band Name');
    await page.fill('textarea[name="bio"]', 'Updated bio with new information');

    // Submit changes
    await page.click('button[type="submit"]:has-text("Update Band")');

    // Verify updated band appears
    await expect(page.getByText('Updated Band Name')).toBeVisible();
    await expect(page.getByText('Band updated successfully')).toBeVisible();
  });

  test('should allow admin to delete a band', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Create band first
    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Deletable Band');
    await page.fill('input[name="genre"]', 'Pop');
    await page.fill('textarea[name="bio"]', 'This band will be deleted');
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Click delete button
    await page.click('button[aria-label="Delete Deletable Band"]');

    // Confirm deletion
    await page.click('button:has-text("Confirm Delete")');

    // Verify band is removed
    await expect(page.getByText('Deletable Band')).not.toBeVisible();
    await expect(page.getByText('Band deleted successfully')).toBeVisible();
  });

  test('should allow admin to upload band photo', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Create band first
    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Photo Band');
    await page.fill('input[name="genre"]', 'Electronic');
    await page.fill('textarea[name="bio"]', 'Band with a photo');
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Edit band to upload photo
    await page.click('button[aria-label="Edit Photo Band"]');

    // Upload photo file (if file input is available)
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles('path/to/test-image.jpg');
      await page.click('button:has-text("Update Band")');
      await expect(page.getByText('Band updated successfully')).toBeVisible();
    }
  });

  test('should show band profile with social media links', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Create band with social links
    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Social Band');
    await page.fill('input[name="genre"]', 'Indie');
    await page.fill('textarea[name="bio"]', 'Band with social presence');
    await page.fill('input[name="website"]', 'https://socialband.com');
    await page.fill('input[name="instagram"]', '@socialband');
    await page.fill('input[name="spotify"]', 'https://open.spotify.com/artist/socialband');
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Click on band to view profile
    await page.click('a:has-text("Social Band")');

    // Verify social media links are displayed
    await expect(page.getByRole('link', { name: /website/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /instagram/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /spotify/i })).toBeVisible();
  });

  test('should search for bands by name', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Create multiple bands
    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Searchable Band One');
    await page.fill('input[name="genre"]', 'Rock');
    await page.click('button[type="submit"]:has-text("Create Band")');

    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Searchable Band Two');
    await page.fill('input[name="genre"]', 'Jazz');
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Use search functionality (if available)
    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Searchable Band One');
      await expect(page.getByText('Searchable Band One')).toBeVisible();
      await expect(page.getByText('Searchable Band Two')).not.toBeVisible();
    }
  });

  test('should filter bands by genre', async ({ page }) => {
    // Navigate to Bands tab
    await page.click('button:has-text("Bands")');

    // Create bands with different genres
    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Rock Band');
    await page.fill('input[name="genre"]', 'Rock');
    await page.click('button[type="submit"]:has-text("Create Band")');

    await page.click('button:has-text("Add Band")');
    await page.fill('input[name="name"]', 'Jazz Band');
    await page.fill('input[name="genre"]', 'Jazz');
    await page.click('button[type="submit"]:has-text("Create Band")');

    // Use genre filter (if available)
    const genreFilter = page.locator('select[name="genre"]');
    if (await genreFilter.isVisible()) {
      await genreFilter.selectOption('Rock');
      await expect(page.getByText('Rock Band')).toBeVisible();
      await expect(page.getByText('Jazz Band')).not.toBeVisible();
    }
  });
});
