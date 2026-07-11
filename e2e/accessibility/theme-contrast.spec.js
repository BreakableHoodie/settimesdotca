/**
 * Theme Contrast — Real-Page Axe Colour-Contrast Coverage (#567)
 *
 * The light themes shipped with unreadable status colours (fixed in #566) and
 * no CI layer could have caught it: design-system.spec.js runs axe's
 * color-contrast rule against hardcoded inline-style fixtures, decoupled from
 * the real CSS custom properties in index.css, and never renders under
 * data-theme="daybreak" / "silver-lining".
 *
 * This spec renders REAL pages under all four themes (frontend/src/components/
 * ThemeProvider.jsx) and runs axe restricted to color-contrast against them, so
 * a future "dark-first colour invisible on a light theme" regression fails CI
 * instead of shipping as a mobile-screenshot bug report (this was at least the
 * third instance of the bug class).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Mirrors frontend/src/components/ThemeProvider.jsx exactly — THEME_KEY and
// VALID_THEMES. Do not let these drift from that file without updating both.
const THEME_STORAGE_KEY = 'settimes-theme';
const THEMES = ['midnight-ember', 'arctic-night', 'daybreak', 'silver-lining'];

/**
 * Seeds localStorage with the target theme before any page script runs, via
 * page.addInitScript — this fires before the theme-flash <script> in
 * frontend/index.html, so data-theme lands on <html> from first paint instead
 * of racing ThemeProvider's mount effect (which would only apply after React
 * hydrates, too late for axe to see the "real" first-paint styling).
 */
async function primeTheme(page, theme) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Private browsing / storage unavailable — the page falls back to the
        // default theme (midnight-ember), which is exercised by that run anyway.
      }
    },
    { key: THEME_STORAGE_KEY, value: theme }
  );
}

/** Renders axe's color-contrast violations (selector + fg/bg colours + ratio)
 * into a readable block for the assertion message, so a CI failure names the
 * offending element instead of just "1 violation". */
function formatViolations(violations) {
  if (violations.length === 0) return '';
  return violations
    .map(violation =>
      violation.nodes
        .map(node => {
          const check = node.any?.find(c => c.id === 'color-contrast') || node.any?.[0];
          const data = check?.data;
          const detail = data
            ? `fg=${data.fgColor} bg=${data.bgColor} ratio=${data.contrastRatio} (needs ${data.expectedContrastRatio})`
            : node.failureSummary || check?.message || 'no contrast data available';
          return `  [${violation.id}] ${node.target.join(' ')} — ${detail}`;
        })
        .join('\n')
    )
    .join('\n');
}

async function assertNoColorContrastViolations(page, label) {
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(
    results.violations,
    `Color-contrast violations on ${label}:\n${formatViolations(results.violations)}`
  ).toEqual([]);
}

/**
 * PrivacyBanner (rendered on /, /event/:slug, and /band/:id — see the
 * `PrivacyBanner` import in EventsPage.jsx, App.jsx, and BandProfilePage.jsx)
 * mounts asynchronously: it reads a localStorage flag in a useEffect before
 * deciding whether to render its "Got it" button. A fresh test context has no
 * 'privacy-acknowledged' entry, so the banner always ends up shown — but
 * without waiting for it, the axe scan can race ahead of that effect and miss
 * the banner on a fast page load, letting a real contrast bug in it (#567)
 * pass by timing luck rather than by actually being fixed. Call this after the
 * page's primary content wait on any page that renders PrivacyBanner.
 */
async function waitForPrivacyBannerSettled(page) {
  await expect(page.getByRole('button', { name: 'Got it' })).toBeVisible({ timeout: 10000 });
}

/** Resolves the seeded upcoming event's slug from the homepage event card —
 * the same [data-testid="event-card"] locator public-timeline.spec.js uses. */
async function resolveEventSlug(page) {
  await page.goto('/');
  const card = page.locator('[data-testid="event-card"]').first();
  await expect(card).toBeVisible();
  const href = await card.locator('h3 a').first().getAttribute('href');
  return href ? href.replace(/^\/event\//, '') : null;
}

/** Resolves a seeded band profile link from the homepage's collapsed
 * "Performers:" preview — the same a[href*="/band/"] locator
 * band-profile-viewing.spec.js uses. Returns null if the seed provides none,
 * so the caller can skip gracefully instead of failing. */
async function resolveBandProfileHref(page) {
  await page.goto('/');
  await expect(page.locator('[data-testid="event-card"]').first()).toBeVisible();
  const bandLink = page.locator('a[href*="/band/"]').or(page.locator('a[href*="/bands/"]')).first();
  const visible = await bandLink.isVisible().catch(() => false);
  if (!visible) return null;
  return bandLink.getAttribute('href');
}

for (const theme of THEMES) {
  test.describe(`Colour contrast — ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await primeTheme(page, theme);
    });

    test('events list (/)', async ({ page }) => {
      await page.goto('/');
      // Use exact:true to avoid matching both "Events" h1 and "Past Events" h2.
      await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="event-card"]').first()).toBeVisible();
      await waitForPrivacyBannerSettled(page);

      await assertNoColorContrastViolations(page, `${theme} — events list (/)`);
    });

    test('event schedule page', async ({ page }) => {
      const slug = await resolveEventSlug(page);
      test.skip(!slug, 'No seeded event slug found on the homepage event card');

      await page.goto(`/event/${slug}`);
      // "Full Lineup" is ScheduleView's unconditional heading — waiting for it
      // guarantees the schedule has rendered past the loading skeleton.
      await expect(page.getByRole('heading', { name: 'Full Lineup' })).toBeVisible({ timeout: 15000 });
      await waitForPrivacyBannerSettled(page);

      await assertNoColorContrastViolations(page, `${theme} — event schedule (/event/${slug})`);
    });

    test('subscribe page (/subscribe)', async ({ page }) => {
      await page.goto('/subscribe');
      await expect(page.getByRole('heading', { name: 'Never Miss a Show' })).toBeVisible();

      await assertNoColorContrastViolations(page, `${theme} — subscribe (/subscribe)`);
    });

    test('band profile page', async ({ page }) => {
      const href = await resolveBandProfileHref(page);
      test.skip(!href, 'Seed data provides no band profile link on the homepage');

      await page.goto(href);
      await expect(page.locator('main h1')).toBeVisible({ timeout: 15000 });

      const notFound = await page
        .getByRole('heading', { name: /band not found/i })
        .isVisible()
        .catch(() => false);
      test.skip(notFound, 'Resolved band link led to a not-found page');

      await waitForPrivacyBannerSettled(page);
      await assertNoColorContrastViolations(page, `${theme} — band profile (${href})`);
    });
  });
}
