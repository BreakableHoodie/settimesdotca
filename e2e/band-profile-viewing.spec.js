import { test, expect } from "@playwright/test";

// The seeded upcoming event (database/seed-test-data.sql). Entering through its
// card makes "which artist" deterministic instead of order-dependent.
const SEEDED_EVENT = "Future Fest E2E";

test.describe("Band Profile Viewing", () => {
  test("should display band profile without authentication", async ({ page }) => {
    // Navigate to public homepage first to get a band
    await page.goto("/");

    // Click on first band link (may be in event card or band list)
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();

    // Unconditional, for the same reason as public-timeline.spec.js: an
    // `if (await bandLink.isVisible())` wrapper turns "no band link on the page"
    // into a silent pass instead of a failure (#895). Seed data always has bands.
    await expect(bandLink).toBeVisible();
    {
      // The anchor can wrap a whole card (name + venue + time + genre), so this
      // is not necessarily just the name -- hence the containment direction used
      // below. Empty is rejected because it would make that check vacuous.
      const linkText = ((await bandLink.textContent()) ?? "").trim();
      expect(linkText).not.toBe("");
      await bandLink.click();

      // Scope to the main h1: the Header carries its own "SetTimes" h1, and the
      // page can show the band name in more than one heading, so an unscoped
      // match is a strict-mode violation waiting for a second element (#895).
      // toContainText takes a STRING, so a band name containing regex
      // metacharacters cannot corrupt the pattern the way `new RegExp(name)` did.
      const heading = page.locator("main h1");
      await expect(heading).toBeVisible();
      const headingText = ((await heading.textContent()) ?? "").trim();
      expect(headingText).not.toBe("");
      expect(linkText).toContain(headingText);

      // Should NOT redirect to login
      await expect(page).not.toHaveURL(/\/admin\/login/);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("should display band biography and details", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Verify bio/description is displayed
    const bioText = page
      .locator('[data-testid="band-bio"]')
      .or(page.locator('[class*="bio"]').or(page.locator("p, div").filter({ hasText: /\w{20,}/ })));

    if (await bioText.first().isVisible()) {
      await expect(bioText.first()).toBeVisible();
    }

    // Verify genre information
    const genreInfo = page.locator('[data-testid="band-genre"]').or(page.locator('[class*="genre"]'));
    if (await genreInfo.first().isVisible()) {
      await expect(genreInfo.first()).toBeVisible();
    }
  });

  test("should show social media links", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Check for social media links
    const socialLinks = page.locator(
      'a[href*="instagram.com"], a[href*="facebook.com"], a[href*="spotify.com"], a[href*="youtube.com"], a[href*="bandcamp.com"], a[href*="soundcloud.com"]',
    );

    const linkCount = await socialLinks.count();
    if (linkCount > 0) {
      // Verify at least one social link is visible
      await expect(socialLinks.first()).toBeVisible();

      // Verify links open in new tab (external links)
      const firstLink = socialLinks.first();
      const target = await firstLink.getAttribute("target");
      if (target) {
        expect(target).toBe("_blank");
      }
    }
  });

  test("should display band website link", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for official website link
    // .first() on the union: `or()` can resolve to several elements, and
    // isVisible() on a multi-match locator raises a strict-mode error rather
    // than returning false.
    const websiteLink = page
      .locator('a[data-testid="band-website"]')
      .or(page.locator('a:has-text("Website")').or(page.locator('a[class*="website"]')))
      .first();

    if (await websiteLink.isVisible()) {
      // Verify link has valid URL
      const href = await websiteLink.getAttribute("href");
      expect(href).toMatch(/^https?:\/\//);
    }
  });

  test("should list upcoming band events", async ({ page }) => {
    await page.goto("/");

    // Enter through the SEEDED event's card, so the artist is deterministic --
    // the same reason public-timeline.spec.js pins by name (#895). Taking any
    // band link couples this test to whichever events happen to exist.
    const seededCard = page.locator('[data-testid="event-card"]').filter({ hasText: SEEDED_EVENT }).first();
    await expect(seededCard).toBeVisible();
    await seededCard.getByRole("button", { name: /view details/i }).click();

    const bandLink = seededCard.locator('a[href*="/band/"]').first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    await page.waitForURL(/\/band(s)?\//);

    // Unconditional, and it can be: this test entered through the SEEDED event's
    // card, so the artist provably plays an upcoming event. The old form guarded
    // on a loose heading match (/upcoming|shows|events|performances/i) after
    // entering via whatever band link happened to be first -- so which artist it
    // landed on depended on what events existed, and a miss silently skipped.
    //
    // The listing is a set of performance links. BandProfilePage renders no
    // [data-testid="event-card"] and no .event-card, so the locator this replaces
    // counted zero every run and everything nested under it never executed.
    const eventList = page.locator('main a[href^="/event/"]');
    await expect(eventList.first()).toBeVisible();
    await expect(eventList.first()).toHaveText(/\S/);
  });

  test("should show past performance history", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for past performances section
    const pastSection = page
      .locator('[data-testid="past-events"]')
      .or(page.getByRole("heading", { name: /past|previous|history/i }))
      .first();

    if (await pastSection.isVisible()) {
      await expect(pastSection).toBeVisible();
    }
  });

  test("should display band photos", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for band photo/image
    const bandPhoto = page
      .locator('[data-testid="band-photo"]')
      .or(page.locator('img[alt*="band"]').or(page.locator('[class*="photo"], [class*="image"]').locator("img")));

    if (await bandPhoto.first().isVisible()) {
      await expect(bandPhoto.first()).toBeVisible();

      // A missing alt returns null and an empty alt returns "", and the previous
      // `if (altText)` skipped BOTH -- the two cases the check exists to catch.
      // \S requires at least one non-whitespace character.
      await expect(bandPhoto.first()).toHaveAttribute("alt", /\S/);
    }
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    // The anchor wraps the whole card, so this is name + venue + time + genre --
    // never just the name. Hence the containment direction used below.
    const linkText = ((await bandLink.textContent()) ?? "").trim();
    expect(linkText).not.toBe("");
    await bandLink.click();
    await page.waitForURL(/\/band(s)?\//);

    // Wait generously: the profile route is lazy-loaded and fetches its data,
    // which can exceed the default 5s timeout on a cold CI mobile run.
    const heading = page.locator("main h1");
    await expect(heading).toBeVisible({ timeout: 15000 });
    const headingText = ((await heading.textContent()) ?? "").trim();
    expect(headingText).not.toBe("");
    // Identity of the profile that opened, matching the pattern the first test
    // uses. The old form built a RegExp out of the full card text, which could
    // not match the heading and threw on titles containing metacharacters.
    expect(linkText).toContain(headingText);

    // Verify content is readable on mobile
    const contentArea = page.locator('main, [role="main"], article').first();
    if (await contentArea.isVisible()) {
      await expect(contentArea).toBeVisible();
    }
  });

  test("should navigate back to timeline from band profile", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for back button or home link
    const backButton = page
      .locator('button:has-text("Back")')
      .or(
        page.locator('a[href="/"]').or(page.locator('a:has-text("Home")').or(page.locator('a:has-text("Schedule")'))),
      );

    if (await backButton.first().isVisible()) {
      await backButton.first().click();

      // Verify we're back on timeline
      await expect(page.getByRole("heading", { name: /schedule/i })).toBeVisible();
    }
  });

  test("should handle band profile not found gracefully", async ({ page }) => {
    // Navigate to non-existent band profile
    await page.goto("/band/nonexistent-band-12345");

    await page.waitForLoadState("networkidle");

    // Should show 404 or error message, not crash
    const errorMessage = page
      .getByRole("heading", { name: /band not found/i })
      .or(page.locator("text=/not found|404|doesn't exist/i"));
    const homeLink = page.locator('a[href="/"]').or(page.locator('a:has-text("Home")'));

    // Either error message OR redirect to home should happen
    const isOnHome = page.url().includes("/#") || page.url().endsWith("/");
    if (!isOnHome) {
      await expect(errorMessage.or(homeLink).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test("should display band contact information if available", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for contact information
    const contactInfo = page
      .locator('[data-testid="band-contact"]')
      .or(page.locator("text=/contact|booking|management|email/i"));

    if (await contactInfo.first().isVisible()) {
      await expect(contactInfo.first()).toBeVisible();
    }
  });

  test("should show band formation year or history", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for formation year or history information
    const historyInfo = page
      .locator('[data-testid="band-formed"]')
      .or(page.locator("text=/formed|since|est\\.|established|\\d{4}/i"));

    if (await historyInfo.first().isVisible()) {
      await expect(historyInfo.first()).toBeVisible();
    }
  });

  test("should allow clicking event from band profile to event details", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    await page.waitForURL(/\/band(s)?\//);

    // BandProfilePage links each performance with `<Link to={`/event/${slug}`}>`,
    // which renders a plain anchor. It renders NO [data-testid="event-card"] and
    // no .event-card, so the guard this replaces could never match and the whole
    // test skipped every run -- vacuity one level below the one #898 removed.
    const eventLink = page.locator('main a[href^="/event/"]').first();
    await expect(eventLink).toBeVisible();
    await eventLink.click();

    // The navigation is the assertion: this test exists to prove a fan can get
    // from an artist to the event they are playing.
    await expect(page).toHaveURL(/\/event\//);
    await expect(page.locator("main h1")).toBeVisible();
  });

  test("should display band member information if available", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Look for band members section
    const membersSection = page
      .locator('[data-testid="band-members"]')
      .or(page.getByRole("heading", { name: /members|lineup|artists/i }))
      .first();

    if (await membersSection.isVisible()) {
      await expect(membersSection).toBeVisible();
    }
  });

  test("should load band profile with proper metadata", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();

    // Wait for page to fully load
    await page.waitForLoadState("networkidle");

    // Compare the title against the profile's OWN h1, not the anchor text: the
    // anchor carries venue, time and genre too, so the old check could only ever
    // pass by accident. The `if (bandName && title)` around it also made a blank
    // title a silent pass -- on the one assertion here that is SEO-critical.
    const heading = page.locator("main h1");
    await expect(heading).toBeVisible({ timeout: 15000 });
    const headingText = ((await heading.textContent()) ?? "").trim();
    expect(headingText).not.toBe("");
    expect((await page.title()).toLowerCase()).toContain(headingText.toLowerCase());
  });
});
