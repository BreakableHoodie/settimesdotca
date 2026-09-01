// NAVIGATION IN THIS FILE IS CLIENT-SIDE. The timeline's performer chips are
// react-router Links, so clicking one changes the URL via pushState and React
// renders the new route afterwards. Anything that reads rendered content with a
// single bare `textContent()` / `page.title()` after a click can therefore
// observe the PREVIOUS page -- typically the SetTimes brand heading -- and
// compare the wrong string. Full page loads used to hide this by making
// navigation and render the same event.
//
// waitForURL and toHaveURL do NOT help: the URL is the thing that changes first.
// Wrap the assertion in `expect(async () => {...}).toPass()` so it retries until
// the transition settles. Auto-retrying matchers (toBeVisible, toContainText)
// are already safe and need no change.
//
// This has already caught three tests in this file, and only one of them failed
// locally -- a faster machine renders inside the gap. Do not conclude from a
// green local run that a bare read is safe.

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
      await page.waitForURL(/\/bands?\//);

      // Scope to the main h1: the Header carries its own "SetTimes" h1, and the
      // page can show the band name in more than one heading, so an unscoped
      // match is a strict-mode violation waiting for a second element (#895).
      // toContainText takes a STRING, so a band name containing regex
      // metacharacters cannot corrupt the pattern the way `new RegExp(name)` did.
      const heading = page.locator("main h1");
      await expect(heading).toBeVisible();
      // POLLED -- see the note at the top of this file on client-side navigation.
      await expect(async () => {
        const headingText = ((await heading.textContent()) ?? "").trim();
        expect(headingText).not.toBe("");
        expect(linkText).toContain(headingText);
      }).toPass({ timeout: 15000 });

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
    await page.waitForURL(/\/bands?\//);

    // Verify bio/description is displayed
    // Scoped to <main>: the `p, div` + /\w{20,}/ fallback matches ANY container
    // with 20+ word characters, and Footer.jsx has 7 such text nodes on every
    // page — so unscoped, this guard passes whether or not the artist has a bio.
    const main = page.locator("main");
    const bioText = main
      .locator('[data-testid="band-bio"]')
      .or(main.locator('[class*="bio"]').or(main.locator("p, div").filter({ hasText: /\w{20,}/ })));

    if ((await bioText.count()) > 0) {
      await expect(bioText.first()).toBeVisible();
    }

    // Verify genre information
    const genreInfo = page.locator('[data-testid="band-genre"]').or(page.locator('[class*="genre"]'));
    if ((await genreInfo.count()) > 0) {
      await expect(genreInfo.first()).toBeVisible();
    }
  });

  test("should show social media links", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    // Wait for the destination before querying it. Without this the assertions
    // below race the client-side route swap.
    await page.waitForURL(/\/bands?\//);

    // Scoped to <main>, NOT the whole page. Footer.jsx renders an instagram.com
    // link on every page, so a page-wide locator is satisfied by the footer even
    // when the artist has no socials at all — and worse, it matched the HOMEPAGE
    // footer before navigation finished, so `count()` saw 1 and the assertions
    // then ran against a page where the locator resolved to nothing. That is the
    // failure this test produced in CI: "waiting for locator(...)" with no
    // resolution, after count() had already returned > 0.
    // BandProfilePage renders <main id="main-content">; <Footer /> sits outside it.
    const socialLinks = page
      .locator("main")
      .locator(
        'a[href*="instagram.com"], a[href*="facebook.com"], a[href*="spotify.com"], a[href*="youtube.com"], a[href*="bandcamp.com"], a[href*="soundcloud.com"]',
      );

    const linkCount = await socialLinks.count();
    if (linkCount > 0) {
      // Verify at least one social link is visible
      await expect(socialLinks.first()).toBeVisible();

      // toHaveAttribute, not getAttribute-then-compare. `count()` above and a
      // later `getAttribute()` are two separate round trips, and BandProfilePage
      // re-renders as its data resolves — so the element the first call saw can
      // be detached by the time the second runs, which surfaces as a 30s
      // timeout rather than a useful failure (#1026: failed 3x in one run, then
      // passed on a plain re-run of the same commit). toHaveAttribute retries
      // on detachment and re-resolves the locator each time.
      //
      // Unconditional on purpose. The old `if (target)` meant a missing
      // attribute asserted NOTHING and still passed — the vacuous-guard shape
      // #897/#899 removed elsewhere in this file. All eight social anchors in
      // BandProfilePage.jsx hardcode target="_blank", so there is no legitimate
      // case for it to be absent.
      await expect(socialLinks.first()).toHaveAttribute("target", "_blank");
    }
  });

  test("should display band website link", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    await page.waitForURL(/\/bands?\//);

    // Look for official website link
    // .first() on the union: `or()` can resolve to several elements, and
    // isVisible() on a multi-match locator raises a strict-mode error rather
    // than returning false.
    // Scoped to <main>: Footer.jsx contains the word "Website", so
    // `a:has-text("Website")` matches site chrome on every page.
    const main = page.locator("main");
    const websiteLink = main
      .locator('a[data-testid="band-website"]')
      .or(main.locator('a:has-text("Website")').or(main.locator('a[class*="website"]')))
      .first();

    // The outer guard stays: a band legitimately may have no website, which is
    // optional CONTENT rather than a missing entry point (see #897/#899 — the
    // distinction that matters is guarding optional content vs. guarding the
    // subject of the test out of existence).
    if (await websiteLink.isVisible()) {
      // Same fetch-then-compare race as above, same fix.
      await expect(websiteLink).toHaveAttribute("href", /^https?:\/\//);
    }
  });

  test("should list upcoming band events", async ({ page }) => {
    await page.goto("/");

    // Enter through the seeded event's card: that fixes WHICH artist this test
    // opens, and guarantees they have an upcoming performance to list.
    const seededCard = page.locator('[data-testid="event-card"]').filter({ hasText: SEEDED_EVENT }).first();
    await expect(seededCard).toBeVisible();
    await seededCard.getByRole("button", { name: /view details/i }).click();

    const bandLink = seededCard.locator('a[href*="/band/"]').first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    await page.waitForURL(/\/band(s)?\//);

    // BandProfilePage lists performances as `<Link to={`/event/${slug}`}>` and
    // renders no [data-testid="event-card"] -- do not reach for one here.
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
    await page.waitForURL(/\/bands?\//);

    // Look for past performances section
    const pastSection = page
      .locator('[data-testid="past-events"]')
      .or(page.getByRole("heading", { name: /past|previous|history/i }))
      .first();

    if ((await pastSection.count()) > 0) {
      await expect(pastSection).toBeVisible();
    }
  });

  test("should display band photos", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    await page.waitForURL(/\/bands?\//);

    // Look for band photo/image
    const bandPhoto = page
      .locator('[data-testid="band-photo"]')
      .or(page.locator('img[alt*="band"]').or(page.locator('[class*="photo"], [class*="image"]').locator("img")));

    if ((await bandPhoto.count()) > 0) {
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

    // POLLED, because the timeline's performer chips navigate client-side. A
    // pushState URL change lands BEFORE React renders the new route, so
    // waitForURL above can resolve while `main h1` still holds the previous
    // page's heading (the SetTimes brand) -- a bare textContent() read then
    // compares the wrong string. Full page loads hid this by making navigation
    // and render the same event.
    //
    // The assertion itself is unchanged: identity of the profile that opened,
    // matching the pattern the first test uses. The old form built a RegExp out
    // of the full card text, which could not match the heading and threw on
    // titles containing metacharacters.
    await expect(async () => {
      const headingText = ((await heading.textContent()) ?? "").trim();
      expect(headingText).not.toBe("");
      expect(linkText).toContain(headingText);
    }).toPass({ timeout: 15000 });

    // Verify content is readable on mobile
    const contentArea = page.locator('main, [role="main"], article').first();
    if ((await contentArea.count()) > 0) {
      await expect(contentArea).toBeVisible();
    }
  });

  test("should navigate back to timeline from band profile", async ({ page }) => {
    // This test used to assert a heading matching /schedule/i after clicking an
    // `.or()` chain's `.first()` match. TWO things were wrong with that:
    //
    //   1. `.first()` in DOM order resolves to the brand link (`a[href="/"]`),
    //      which goes to "/" -- and NO heading on "/" matches /schedule/i. The
    //      headings there are SetTimes, Events, Happening Now, Coming Up, Past
    //      Events. The only "schedule" heading is the sr-only h1 on
    //      /event/<slug>, which that click never reaches.
    //   2. The whole assertion sat behind `if (await ...isVisible())`, so when
    //      the element was not yet visible the test passed having asserted
    //      NOTHING. That is how an impossible assertion stayed green.
    //
    // It surfaced when the timeline's performer chips became router Links: the
    // client-side transition is instant, the back affordance was visible in
    // time, the `if` finally ran, and the impossible assertion failed.
    //
    // Rewritten to be unconditional and to assert something that is actually
    // true of the destination.
    await page.goto("/");

    const bandLink = page.locator('a[href*="/band/"]').first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    await expect(page).toHaveURL(/\/band\//);

    // The brand link is always present in the profile header, unlike
    // "Back to Schedule", which renders only when ?fromEvent= resolves.
    const home = page.getByRole("link", { name: /settimes/i }).first();
    await expect(home).toBeVisible();
    await home.click();

    // Back on the timeline. "Events" is the events list's own <h2> and renders
    // unconditionally; the page's h1 is the SetTimes brand.
    await expect(page).toHaveURL(/\/$/);
    // exact: true is load-bearing -- Playwright's name matching defaults to
    // case-insensitive SUBSTRING, so "Events" also matches the "Past Events"
    // heading and trips strict mode. Same collision class as an unscoped
    // getByText.
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
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
    await page.waitForURL(/\/bands?\//);

    // Look for contact information
    // Scoped to <main>: Footer.jsx contains "Contact", so the text regex below
    // matches site chrome on every page — the same shape as the social-links
    // guard that was satisfied by the footer's instagram link.
    const main = page.locator("main");
    const contactInfo = main
      .locator('[data-testid="band-contact"]')
      .or(main.locator("text=/contact|booking|management|email/i"));

    if ((await contactInfo.count()) > 0) {
      await expect(contactInfo.first()).toBeVisible();
    }
  });

  test("should show band formation year or history", async ({ page }) => {
    await page.goto("/");

    // Navigate to band profile
    const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
    await expect(bandLink).toBeVisible();
    await bandLink.click();
    await page.waitForURL(/\/bands?\//);

    // Look for formation year or history information
    const historyInfo = page
      .locator('[data-testid="band-formed"]')
      .or(page.locator("text=/formed|since|est\\.|established|\\d{4}/i"));

    if ((await historyInfo.count()) > 0) {
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
    await page.waitForURL(/\/bands?\//);

    // Look for band members section
    const membersSection = page
      .locator('[data-testid="band-members"]')
      .or(page.getByRole("heading", { name: /members|lineup|artists/i }))
      .first();

    if ((await membersSection.count()) > 0) {
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
    // POLLED -- see the note at the top of this file. document.title is also set
    // in an effect after the fetch resolves, so it settles independently of the
    // heading; a single read can catch either one mid-transition.
    await expect(async () => {
      const headingText = ((await heading.textContent()) ?? "").trim();
      expect(headingText).not.toBe("");
      expect((await page.title()).toLowerCase()).toContain(headingText.toLowerCase());
    }).toPass({ timeout: 15000 });
  });
});
