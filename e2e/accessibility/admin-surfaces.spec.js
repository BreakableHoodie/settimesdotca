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

const surfaces = [
  { id: "events", label: "Events", heading: "Events" },
  { id: "lineup", label: "Lineup", heading: "Event Lineup" },
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
  await page.goto("/admin");
  await expect(page.getByRole("tab", { name: "Events", exact: true })).toBeVisible();

  if (surface.id === "lineup") {
    const eventSelector = page.locator("#event-selector");
    await expect(eventSelector).toBeVisible();
    await expect(eventSelector.locator("option").nth(1)).toBeAttached({ timeout: 15000 });
    await eventSelector.selectOption({ index: 1 });
  }

  const tab = page.getByRole("tab", { name: surface.label, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
};

test.describe("Admin Surfaces - Accessibility", () => {
  for (const surface of surfaces) {
    test(`${surface.label} tab has no targeted axe violations`, async ({ page }) => {
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
