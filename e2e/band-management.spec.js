import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils/session";

const openRosterTab = async (page) => {
  await page.click('button:has-text("Roster")');
};

test.describe("Band Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("should allow admin to create a new artist", async ({ page }) => {
    const suffix = Date.now();
    const bandName = `Test Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await expect(page.getByRole("heading", { name: "New Artist" })).toBeVisible();

    await page.fill('input[name="name"]', bandName);
    await page.fill('input[name="genre"]', "Rock");
    await page.locator(".ProseMirror").first().fill("A test band with great music");
    await page.fill('input[name="website"]', "https://testband.com");
    await page.fill('input[name="instagram"]', "@testband");
    await page.fill('input[name="bandcamp"]', "https://bandcamp.com/testband");

    await page.click('button[type="submit"]:has-text("Add Artist")');

    const row = page.locator("table tbody tr", { hasText: bandName }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Rock");
  });

  test("should validate required artist name", async ({ page }) => {
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.click('button[type="submit"]:has-text("Add Artist")');

    const nameMissing = await page.locator('input[name="name"]').evaluate((input) => input.validity.valueMissing);
    expect(nameMissing).toBe(true);
  });

  test("should allow admin to edit artist profile", async ({ page }) => {
    const suffix = Date.now();
    const originalName = `Editable Band ${suffix}`;
    const updatedName = `Updated Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.fill('input[name="name"]', originalName);
    await page.fill('input[name="genre"]', "Jazz");
    await page.locator(".ProseMirror").first().fill("Original bio");
    await page.click('button[type="submit"]:has-text("Add Artist")');

    await page.locator("tr", { hasText: originalName }).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Artist" })).toBeVisible();

    await page.fill('input[name="name"]', updatedName);
    await page.locator(".ProseMirror").first().fill("Updated bio with new information");

    await page.click('button[type="submit"]:has-text("Update Artist")');

    const updatedRow = page.locator("table tbody tr", { hasText: updatedName }).first();
    await expect(updatedRow).toBeVisible();
    await expect(page.getByText("Artist updated")).toBeVisible();
  });

  test("should allow admin to delete an artist", async ({ page }) => {
    const suffix = Date.now();
    const bandName = `Deletable Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.fill('input[name="name"]', bandName);
    await page.fill('input[name="genre"]', "Pop");
    await page.locator(".ProseMirror").first().fill("This band will be deleted");
    await page.click('button[type="submit"]:has-text("Add Artist")');

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("tr", { hasText: bandName }).getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Artist deleted")).toBeVisible();
  });

  test("should allow admin to upload band photo", async ({ page }) => {
    const suffix = Date.now();
    const bandName = `Photo Band ${suffix}`;
    await openRosterTab(page);

    await page.click('button:has-text("New Artist")');
    await page.fill('input[name="name"]', bandName);
    await page.fill('input[name="genre"]', "Electronic");
    await page.click('button[type="submit"]:has-text("Add Artist")');

    await page.locator("tr", { hasText: bandName }).getByRole("button", { name: "Edit" }).click();

    // Unconditional, both levels. This test was named for uploading a photo and
    // PASSED WHEN THE UPLOAD FAILED: its only assertion sat behind
    // `if (!hasError)`, so an error state skipped it and the test reported green.
    // The outer `if (await fileInput.isVisible())` did the same for the whole body.
    //
    // The upload itself works: env.BAND_PHOTOS is bound from wrangler.toml's
    // [[r2_buckets]], so `wrangler pages dev` resolves it with no --r2 flag needed
    // (its startup output lists the binding). Verified by running this test
    // unconditionally against a server started without one -- it passes.
    //
    // So the defect was never a missing binding, only an assertion that could not
    // fail. An upload error now fails the test rather than excusing it (#1062).
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "test.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    // Assert the src is an http(s) URL, NOT merely that an image is visible.
    // PhotoUpload sets the preview from a LOCAL FileReader before the upload
    // starts (a data: URI), and only replaces it with data.url once the server
    // responds. So toBeVisible() matched the local preview immediately and
    // passed even with the upload broken -- verified by replacing
    // env.BAND_PHOTOS.put() with a rejection: the old assertion stayed green.
    //
    // Waiting for an https src is what actually waits for the round trip, and
    // on failure the component reverts the preview to currentPhoto (null for a
    // new artist), so this cannot pass without a stored URL coming back.
    await expect(page.locator('img[alt="Band profile"]')).toHaveAttribute("src", /^https?:\/\//, {
      timeout: 15000,
    });
    await expect(page.getByText(/upload failed|invalid file type|file too large/i)).toHaveCount(0);
  });

  test.skip("should show band profile with social media links", async ({ page }) => {
    // Roster view does not expose public profile links; covered in public tests instead.
    await openRosterTab(page);
  });

  test.skip("should search for bands by name", async ({ page }) => {
    // Roster view does not currently include search.
    await openRosterTab(page);
  });

  test.skip("should filter bands by genre", async ({ page }) => {
    // Roster view does not currently include genre filtering.
    await openRosterTab(page);
  });
});
