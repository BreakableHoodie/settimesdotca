// Layout shift while data loads. Each page here renders a short "Loading..."
// state, then its content once /api answers. If anything already on screen
// (the footer, a header line) moves when that content lands, the shift counts
// against CLS. Lighthouse CI caught it on /venue/1 only in 2 of 3 runs (0.30,
// against a 0.1 budget), because whether it happens depends on whether the data
// arrives before first paint. This spec removes the race: every /api response
// is held back, so the loading state is always painted first.
//
// Budget is Lighthouse's own: 0.1, the "good" CLS threshold. Measured on a phone
// viewport, as Lighthouse does, where a footer is most likely to be in view.

import { test, expect } from "@playwright/test";

const API_DELAY_MS = 1500;
const CLS_BUDGET = 0.1;
// Each page, with text from the seed data (database/seed-test-data.sql) that it
// can render only once its /api data has arrived. An error state, or a page
// that never got past loading, fails here rather than passing with no shift.
const PAGES = {
  "/": (page) => page.getByText("Future Fest E2E Long Weekend Edition").first(),
  "/venues": (page) => page.getByText("Cambridge Folk Club").first(),
  "/venue/1": (page) => page.getByRole("heading", { level: 1, name: "Waterloo Music Hall" }),
  "/artists": (page) => page.getByText("Future Sound").first(),
  "/history": (page) => page.getByText("Multi-Day Fest E2E").first(),
  "/band/2": (page) => page.getByRole("heading", { level: 1, name: "Future Sound" }),
  "/event/future-fest-e2e": (page) =>
    page.getByRole("heading", { level: 2, name: "Future Fest E2E Long Weekend Edition" }),
};

test.use({ viewport: { width: 412, height: 823 }, serviceWorkers: "block" });

for (const [path, loaded] of Object.entries(PAGES)) {
  test(`${path} does not shift once its data loads`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__layoutShift = { total: 0, sources: [] };
      const accumulate = (entries) => {
        for (const entry of entries) {
          if (entry.hadRecentInput) continue;
          window.__layoutShift.total += entry.value;
          for (const s of entry.sources) {
            const node = s.node;
            window.__layoutShift.sources.push(
              node ? `${node.nodeName}.${String(node.className || "").slice(0, 60)}` : "?",
            );
          }
        }
      };
      const observer = new PerformanceObserver((list) => accumulate(list.getEntries()));
      observer.observe({ type: "layout-shift", buffered: true });
      // The browser may hold records back from the callback; take them directly.
      window.__flushLayoutShift = () => accumulate(observer.takeRecords());
    });
    let delayed = 0;
    await page.route("**/api/**", async (route) => {
      delayed += 1;
      await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
      await route.continue();
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(loaded(page)).toBeVisible({ timeout: 15000 });
    // Two frames after the content is visible, so the layout it caused has run.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    // A page that requested no /api data exercised nothing here.
    expect(delayed, `${path} made no /api request, so the delay tested nothing`).toBeGreaterThan(0);
    const { total, sources } = await page.evaluate(() => {
      window.__flushLayoutShift();
      return window.__layoutShift;
    });
    expect(
      total,
      `${path} layout shift ${total.toFixed(4)} from: ${[...new Set(sources)].join(" ; ")}`,
    ).toBeLessThanOrEqual(CLS_BUDGET);
  });
}
