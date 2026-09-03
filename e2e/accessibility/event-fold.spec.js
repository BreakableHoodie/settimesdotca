/**
 * The first screen must lead with the lineup, not with controls.
 *
 * Measured before this guard existed: on a 390px viewport a fan passed roughly
 * 1,300px of chrome -- header, lifecycle pill, clock, title block, poster chip,
 * tab toggle, "How it works", "Full Lineup" heading, view toggle, Copy, Select
 * All, genre dropdown -- before the first act name. Nine controls before one
 * band, on the page people hold standing in the street.
 *
 * The assertion is a POSITION, not a class or a DOM shape, because every
 * cheaper proxy passes on a page that still scrolls. iPhone 12/13/14 viewport.
 *
 * WHY THE BUDGET IS HALF THE FOLD AND NOT THE WHOLE FOLD.
 *
 * The first version of this test asserted only "inside 844px" and PASSED against
 * the seed on day one, which made it useless as the acceptance criterion it was
 * written to be. Measured: the seeded event puts its first act at 827px -- inside
 * the fold by 17 pixels, because the seed has four bands and fewer controls than
 * a real bill. Production `lwbc18`, with fifteen acts and every control, put it
 * at roughly 1,300px.
 *
 * So the whole-fold budget is environment-dependent at exactly the margin that
 * matters, and an act name clinging to the bottom edge of the screen is not
 * "leading with the lineup" in any sense a fan would recognise.
 *
 * LINEUP_BUDGET_PX is half the viewport: on the first screen, half of it should
 * be schedule. That is a claim about the design, it fails today on both the seed
 * and production, and it cannot be satisfied by a page that merely stopped
 * getting worse.
 */
import { test, expect } from "@playwright/test";

const SEEDED_EVENT = "future-fest-e2e";
const FOLD_PX = 844;
const LINEUP_BUDGET_PX = Math.round(FOLD_PX / 2);

test.describe("Event page fold (#1074 / Vol 18 phase 1)", () => {
  test.use({ viewport: { width: 390, height: FOLD_PX } });

  test("an act name is visible without scrolling", async ({ page, request }) => {
    const res = await request.get(`/api/schedule?event=${SEEDED_EVENT}`);
    expect(res.ok(), "seeded schedule should resolve").toBeTruthy();
    const body = await res.json();
    const names = (body.bands || []).map((b) => b.name).filter(Boolean);
    expect(names.length, "seed must have performances for this to mean anything").toBeGreaterThan(0);

    await page.goto(`/event/${SEEDED_EVENT}`);
    // Wait for a REAL ACT to be in the DOM, never a heading.
    //
    // This waited on the "Full Lineup" heading until Copilot pointed out the
    // circularity: that heading is now `sr-only` below `sm:` -- the very change
    // this test measures -- so the readiness signal depended on a visually hidden
    // element and told us nothing about whether the lineup had rendered. It is
    // also the anti-pattern public-routes.spec.js warns about in its own header:
    // a heading is not a data-ready signal, because it paints before the fetch
    // resolves. An act name cannot appear until the schedule has loaded.
    await expect(page.getByText(names[0], { exact: true }).first()).toBeVisible({ timeout: 15000 });

    const firstActTop = await page.evaluate((actNames) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (!actNames.includes(text)) continue;
        const el = node.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Skip anything not actually painted (sr-only, display:none, zero-box).
        if (rect.height === 0 || rect.width === 0) continue;
        return rect.top;
      }
      return null;
    }, names);

    expect(firstActTop, `no act name from ${JSON.stringify(names.slice(0, 3))} was rendered at all`).not.toBeNull();

    // The floor: an act name below this is not on the first screen at all.
    expect(
      firstActTop,
      `first act name renders ${Math.round(firstActTop)}px down, past the ${FOLD_PX}px fold entirely`,
    ).toBeLessThan(FOLD_PX);

    // The real bar. See the header for why the fold alone is not enough.
    expect(
      firstActTop,
      `first act name renders ${Math.round(firstActTop)}px down; the lineup should start within ` +
        `${LINEUP_BUDGET_PX}px so half the first screen is schedule rather than controls`,
    ).toBeLessThan(LINEUP_BUDGET_PX);
  });
});
