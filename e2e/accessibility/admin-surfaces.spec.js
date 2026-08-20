/**
 * Admin Surfaces - Targeted Accessibility Testing
 *
 * Covers:
 * - axe-core forms and name-role-value checks for the Events tab
 * - axe-core forms and name-role-value checks for the Lineup tab
 * - axe-core forms and name-role-value checks for the Roster tab
 * - axe-core forms and name-role-value checks for the Venues tab
 * - axe-core forms and name-role-value checks for the Users tab
 *
 * This suite intentionally uses a narrow first-pass ruleset instead of the
 * broad WCAG tags used by the smaller admin login page. It keeps the initial
 * gate actionable while leaving room to expand coverage incrementally.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsAdmin } from "../utils/session";

// Seeded by database/seed-test-data.sql and the only seeded event with
// performances, so it is what makes the Lineup audit non-empty.
const SEEDED_EVENT = "Future Fest E2E";

// A two-day event (end_date > date), which is the ONLY way LineupTab renders its
// day filter -- `isMultiDayEvent()` gates it. Seeded by #886 for exactly this.
const SEEDED_MULTIDAY_EVENT = "Multi-Day Fest E2E";

const surfaces = [
  { id: "events", label: "Events", heading: "Events" },
  {
    id: "lineup",
    label: "Lineup",
    heading: "Event Lineup",
    eventName: SEEDED_EVENT,
    readyLocator: (page) => page.locator("#main-content table tbody tr").first(),
  },
  {
    id: "lineup",
    title: "Lineup (multi-day)",
    label: "Lineup",
    heading: "Event Lineup",
    eventName: SEEDED_MULTIDAY_EVENT,
    readyLocator: (page) => page.locator("#main-content table tbody tr").first(),
    // The day filter is the whole point of this case. Asserting it is present
    // BEFORE analyze() is what stops the test going vacuous: if the fixture
    // regressed to single-day the control would simply not render, and axe
    // would report a clean pass for a control it never saw.
    requiresDayFilter: true,
  },
  { id: "roster", label: "Roster", heading: "Global Artist Roster" },
  { id: "venues", label: "Venues", heading: "Venues" },
  { id: "users", label: "Users", heading: "User Management" },
];

const getViolationSummary = (violations) =>
  violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map(({ target }) => target),
  }));

const openSurface = async (page, surface) => {
  await loginAsAdmin(page);
  await expect(page.getByRole("tab", { name: "Events", exact: true })).toBeVisible({ timeout: 15000 });

  if (surface.id === "lineup") {
    // Pick the seeded event by name, not by index: the selector's order comes
    // from the API and index 1 is whichever event sorts first, which may have
    // no performances — and a Lineup with no rows audits almost nothing.
    const eventSelector = page.locator("#event-selector");
    await expect(eventSelector).toBeVisible();
    // Select by VALUE, resolved from the option text. The option label is
    // `{name} {status}` (e.g. "Future Fest E2E (Published)"), so an exact-label
    // match fails and a status change would silently break it.
    const option = eventSelector.locator("option", { hasText: surface.eventName ?? SEEDED_EVENT }).first();
    await expect(option).toBeAttached({ timeout: 15000 });
    await eventSelector.selectOption(await option.getAttribute("value"));
  }

  const tab = page.getByRole("tab", { name: surface.label, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();

  // The heading is NOT a data-ready signal. LineupTab has no `if (loading)`
  // guard — it renders its heading as soon as an event is selected, so axe
  // could otherwise scan a Lineup whose rows have not arrived and report a
  // clean pass for controls it never saw. Wait for a real row.
  if (surface.readyLocator) {
    await expect(surface.readyLocator(page)).toBeVisible({ timeout: 15000 });
  }

  if (surface.requiresDayFilter) {
    await expect(page.getByLabel("Filter performers by day")).toBeVisible({ timeout: 15000 });
  }
};

test.describe("Admin Surfaces - Accessibility", () => {
  for (const surface of surfaces) {
    test(`${surface.title ?? surface.label} tab has no targeted axe violations`, async ({ page }) => {
      await openSurface(page, surface);

      const results = await new AxeBuilder({ page })
        .include("#main-content")
        .withTags(["cat.forms", "cat.name-role-value"])
        .analyze();

      const violations = getViolationSummary(results.violations);
      expect(violations).toEqual([]);
    });
  }
});
