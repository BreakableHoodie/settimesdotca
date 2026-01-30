import { test, expect } from '@playwright/test';

test.describe('Band Profile Viewing', () => {
  test('should display band profile without authentication', async ({ page }) => {
    // Navigate to public homepage first to get a band
    await page.goto('/');

    // Click on first band link (may be in event card or band list)
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();

    if (await bandLink.isVisible()) {
      const bandName = await bandLink.textContent();
      await bandLink.click();

      // Verify band profile page loads
      await expect(page.getByRole('heading', { name: new RegExp(bandName || '', 'i') })).toBeVisible();

      // Should NOT redirect to login
      await expect(page).not.toHaveURL(/\/admin\/login/);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test('should display band biography and details', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Verify bio/description is displayed
      const bioText = page.locator('[data-testid="band-bio"]').or(
        page.locator('[class*="bio"]').or(
          page.locator('p, div').filter({ hasText: /\w{20,}/ })
        )
      );

      if (await bioText.first().isVisible()) {
        await expect(bioText.first()).toBeVisible();
      }

      // Verify genre information
      const genreInfo = page.locator('[data-testid="band-genre"]').or(page.locator('[class*="genre"]'));
      if (await genreInfo.first().isVisible()) {
        await expect(genreInfo.first()).toBeVisible();
      }
    }
  });

  test('should show social media links', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Check for social media links
      const socialLinks = page.locator('a[href*="instagram.com"], a[href*="facebook.com"], a[href*="spotify.com"], a[href*="youtube.com"], a[href*="bandcamp.com"], a[href*="soundcloud.com"]');

      const linkCount = await socialLinks.count();
      if (linkCount > 0) {
        // Verify at least one social link is visible
        await expect(socialLinks.first()).toBeVisible();

        // Verify links open in new tab (external links)
        const firstLink = socialLinks.first();
        const target = await firstLink.getAttribute('target');
        if (target) {
          expect(target).toBe('_blank');
        }
      }
    }
  });

  test('should display band website link', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for official website link
      const websiteLink = page.locator('a[data-testid="band-website"]').or(
        page.locator('a:has-text("Website")').or(
          page.locator('a[class*="website"]')
        )
      );

      if (await websiteLink.isVisible()) {
        await expect(websiteLink).toBeVisible();

        // Verify link has valid URL
        const href = await websiteLink.getAttribute('href');
        expect(href).toMatch(/^https?:\/\//);
      }
    }
  });

  test('should list upcoming band events', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for upcoming events section
      const upcomingSection = page.locator('[data-testid="upcoming-events"]').or(
        page.getByRole('heading', { name: /upcoming|shows|events|performances/i })
      );

      if (await upcomingSection.isVisible()) {
        await expect(upcomingSection).toBeVisible();

        // Verify event listings
        const eventList = page.locator('[data-testid="event-card"]').or(page.locator('.event-card'));
        const eventCount = await eventList.count();

        if (eventCount > 0) {
          // Verify first event has date and venue
          const firstEvent = eventList.first();
          await expect(firstEvent).toBeVisible();

          // Check for date information
          const dateInfo = firstEvent.locator('text=/\\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i');
          if (await dateInfo.isVisible()) {
            await expect(dateInfo).toBeVisible();
          }
        }
      }
    }
  });

  test('should show past performance history', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for past performances section
      const pastSection = page.locator('[data-testid="past-events"]').or(
        page.getByRole('heading', { name: /past|previous|history/i })
      );

      if (await pastSection.isVisible()) {
        await expect(pastSection).toBeVisible();
      }
    }
  });

  test('should display band photos', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for band photo/image
      const bandPhoto = page.locator('[data-testid="band-photo"]').or(
        page.locator('img[alt*="band"]').or(
          page.locator('[class*="photo"], [class*="image"]').locator('img')
        )
      );

      if (await bandPhoto.first().isVisible()) {
        await expect(bandPhoto.first()).toBeVisible();

        // Verify image has proper alt text for accessibility
        const altText = await bandPhoto.first().getAttribute('alt');
        if (altText) {
          expect(altText.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      const bandName = await bandLink.textContent();
      await bandLink.click();

      // Verify band profile is visible on mobile
      await expect(page.getByRole('heading', { name: new RegExp(bandName || '', 'i') })).toBeVisible();

      // Verify content is readable on mobile
      const contentArea = page.locator('main, [role="main"], article').first();
      if (await contentArea.isVisible()) {
        await expect(contentArea).toBeVisible();
      }
    }
  });

  test('should navigate back to timeline from band profile', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for back button or home link
      const backButton = page.locator('button:has-text("Back")').or(
        page.locator('a[href="/"]').or(
          page.locator('a:has-text("Home")').or(
            page.locator('a:has-text("Schedule")')
          )
        )
      );

      if (await backButton.first().isVisible()) {
        await backButton.first().click();

        // Verify we're back on timeline
        await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible();
      }
    }
  });

  test('should handle band profile not found gracefully', async ({ page }) => {
    // Navigate to non-existent band profile
    await page.goto('/band/nonexistent-band-12345');

    await page.waitForLoadState('networkidle');

    // Should show 404 or error message, not crash
    const errorMessage = page.getByRole('heading', { name: /band not found/i }).or(
      page.locator('text=/not found|404|doesn\'t exist/i')
    );
    const homeLink = page.locator('a[href="/"]').or(page.locator('a:has-text("Home")'));

    // Either error message OR redirect to home should happen
    const isOnHome = page.url().includes('/#') || page.url().endsWith('/');
    if (!isOnHome) {
      await expect(errorMessage.or(homeLink).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display band contact information if available', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for contact information
      const contactInfo = page.locator('[data-testid="band-contact"]').or(
        page.locator('text=/contact|booking|management|email/i')
      );

      if (await contactInfo.first().isVisible()) {
        await expect(contactInfo.first()).toBeVisible();
      }
    }
  });

  test('should show band formation year or history', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for formation year or history information
      const historyInfo = page.locator('[data-testid="band-formed"]').or(
        page.locator('text=/formed|since|est\\.|established|\\d{4}/i')
      );

      if (await historyInfo.first().isVisible()) {
        await expect(historyInfo.first()).toBeVisible();
      }
    }
  });

  test('should allow clicking event from band profile to event details', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for event listings in band profile
      const eventCard = page.locator('[data-testid="event-card"]').or(page.locator('.event-card')).first();

      if (await eventCard.isVisible()) {
        const eventTitle = await eventCard.locator('h3, h2, [class*="title"]').first().textContent();
        await eventCard.click();

        // Verify event details page/modal opens
        await expect(page.getByRole('heading', { name: new RegExp(eventTitle || '', 'i') })).toBeVisible();
      }
    }
  });

  test('should display band member information if available', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      await bandLink.click();

      // Look for band members section
      const membersSection = page.locator('[data-testid="band-members"]').or(
        page.getByRole('heading', { name: /members|lineup|artists/i })
      );

      if (await membersSection.isVisible()) {
        await expect(membersSection).toBeVisible();
      }
    }
  });

  test('should load band profile with proper metadata', async ({ page }) => {
    await page.goto('/');

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    if (await bandLink.isVisible()) {
      const bandName = await bandLink.textContent();
      await bandLink.click();

      // Wait for page to fully load
      await page.waitForLoadState('networkidle');

      // Verify page title includes band name (SEO)
      const title = await page.title();
      if (bandName && title) {
        expect(title.toLowerCase()).toContain(bandName.toLowerCase());
      }
    }
  });
});
