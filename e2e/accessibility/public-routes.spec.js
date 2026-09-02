/**
 * Public Routes — Table-Driven Full-Page Axe Coverage (#1072)
 *
 * The fan-facing surface is what crawlers and real users hit first, but most
 * of its routes had no axe coverage: only `/`, `/subscribe`, `/event/:slug`
 * and `/admin/login` were scanned. This spec runs the broad WCAG ruleset (the
 * same `.withTags(...)` standard theme-contrast.spec.js uses, NOT admin's
 * narrow `cat.forms`/`cat.name-role-value`) against every public route, each
 * gated on a data-ready locator so axe can never scan a loading skeleton.
 *
 * The routes here mirror the `<Route>` table in frontend/src/main.jsx. The
 * unit-test guard (frontend/src/__tests__/publicRouteCoverage.test.js) scans
 * that same file and fails when a new public route is added without a spec
 * entry here or an explicit, reasoned exemption — so this list cannot drift
 * silently. Keep the two in step.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Seeded by database/seed-test-data.sql. Slugs are stable and referenced by
// route; band/venue INTEGER ids are resolved at runtime below (they are not
// guaranteed stable across schema changes — see the resolve helpers).
const SEEDED_EVENTS = {
  future: "future-fest-e2e",
  past: "past-fest-e2e",
};

// Mirrors the ready-locator discipline from admin-surfaces.spec.js: a heading
// alone is NOT a data-ready signal — axe scanning a page mid-fetch is worse
// than skipping it. Every data-fetching route waits on real rendered content.
const surfaces = [
  {
    path: "/",
    label: "Home",
    ready: (page) => page.getByRole("heading", { name: "Events", exact: true }),
  },
  {
    path: "/event/:future",
    label: "Event schedule",
    ready: (page) => page.getByRole("heading", { name: "Full Lineup" }),
  },
  {
    path: "/events/:past/recap",
    label: "Event recap",
    ready: (page) => page.getByRole("heading", { name: "Archived Lineup" }),
  },
  { path: "/embed/:future", label: "Embed", ready: (page) => page.getByRole("heading", { name: "Full Lineup" }) },
  { path: "/subscribe", label: "Subscribe", ready: (page) => page.getByRole("heading", { name: "Never Miss a Show" }) },
  {
    path: "/reset-password",
    label: "Reset password (no token)",
    // No token means the verify step never runs, so the FORM never renders --
    // this is the error state, same as /activate below. The token-verified form
    // is still unscanned (needs a live reset row); tracked separately.
    ready: (page) => page.getByRole("heading", { name: "Reset Failed" }),
  },
  {
    path: "/activate",
    label: "Activate (no token)",
    ready: (page) => page.getByRole("heading", { name: "Activation Failed" }),
  },
  { path: "/privacy", label: "Privacy", ready: (page) => page.getByRole("heading", { name: "Privacy Policy" }) },
  { path: "/terms", label: "Terms", ready: (page) => page.getByRole("heading", { name: "Terms of Service" }) },
  { path: "/about", label: "About", ready: (page) => page.getByRole("heading", { name: "About SetTimes" }) },
  { path: "/contact", label: "Contact", ready: (page) => page.getByRole("heading", { name: "Contact" }) },
  { path: "/stats", label: "Stats", ready: (page) => page.getByRole("heading", { name: "SetTimes by the Numbers" }) },
  // Directory pages. Their <h1> renders before the fetch resolves, so a heading
  // is NOT a ready signal -- wait on a real card's profile link.
  {
    path: "/artists",
    label: "Artists directory",
    ready: (page) => page.locator('a[href^="/band/"]').first(),
  },
  {
    path: "/venues",
    label: "Venues directory",
    ready: (page) => page.locator('a[href^="/venue/"]').first(),
  },
  { path: "/band/:resolved", label: "Band profile", needs: "band", ready: (page) => page.locator("main h1") },
  { path: "/venue/:resolved", label: "Venue", needs: "venue", ready: (page) => page.locator("main h1") },
  {
    path: "/s/:created",
    label: "Shared route",
    needs: "share",
    ready: (page) => page.getByRole("heading", { name: /-stop route/ }),
  },
];

/** Mirrors getViolationSummary in admin-surfaces.spec.js so a failure names
 * the rule + offending selectors instead of just "N violations". */
function getViolationSummary(violations) {
  return violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map(({ target }) => target),
  }));
}

/** Resolve a public band profile id at runtime via the public API, never a
 * hardcoded integer — seeds renumber. `Future Sound` is the seeded upcoming
 * artist. */
async function resolveBandId(request, name) {
  const res = await request.get(`/api/bands/${encodeURIComponent(name)}`);
  expect(res.ok(), `GET /api/bands/${name} should resolve`).toBeTruthy();
  const body = await res.json();
  expect(typeof body?.id, `band response should carry an id`).toBe("number");
  return body.id;
}

/** Resolve a public venue id at runtime via the directory API, never a
 * hardcoded integer. The first venue with a performance is fine for a full-page
 * scan. */
async function resolveVenueId(request) {
  const res = await request.get("/api/venues?limit=1");
  expect(res.ok(), "GET /api/venues should resolve").toBeTruthy();
  const body = await res.json();
  const first = body?.venues?.[0];
  expect(typeof first?.id, "venue directory should list at least one venue").toBe("number");
  return first.id;
}

/** Create a runtime share link so `/s/:slug` has real content to scan. The
 * create endpoint is public (POST /api/schedule/share) and the event/ids come
 * from the public schedule response — no hardcoded integers. */
async function createShareSlug(request, eventSlug) {
  const schedule = await request.get(`/api/schedule?event=${encodeURIComponent(eventSlug)}`);
  expect(schedule.ok(), `GET /api/schedule?event=${eventSlug} should resolve`).toBeTruthy();
  const scheduleBody = await schedule.json();
  const bands = Array.isArray(scheduleBody.bands) ? scheduleBody.bands : [];
  const eventId = scheduleBody?.event?.id;
  expect(bands.length, `schedule for ${eventSlug} should have performances`).toBeGreaterThan(0);
  expect(typeof eventId, `schedule for ${eventSlug} should carry an event id`).toBe("number");

  const performanceIds = bands
    .map((b) => b.performance_id)
    .filter((id) => Number.isFinite(id))
    .slice(0, 2);
  expect(performanceIds.length, "share payload needs at least one performance id").toBeGreaterThan(0);

  const res = await request.post("/api/schedule/share", {
    data: {
      event_id: eventId,
      event_slug: eventSlug,
      performance_ids: performanceIds,
      band_names: bands.slice(0, performanceIds.length).map((b) => b.name),
    },
  });
  expect(res.ok(), "POST /api/schedule/share should create a link").toBeTruthy();
  const body = await res.json();
  expect(typeof body?.slug, "share response should carry a slug").toBe("string");
  return body.slug;
}

/** Special case: `/s/:slug` needs its slug created before navigation, and
 * `/band`/`/venue` need their ids resolved. Everything else uses the literal
 * path with seed slugs substituted. */
function resolvePath(surface, ctx) {
  const { bandId, venueId, shareSlug } = ctx;
  return (
    surface.path
      .replace(":future", SEEDED_EVENTS.future)
      .replace(":past", SEEDED_EVENTS.past)
      // Keyed on `needs`, never the display label: a rename would otherwise
      // substitute the wrong id (or "undefined"), and an error page can still
      // satisfy a loose ready locator -- a green scan of the WRONG page.
      .replace(":resolved", surface.needs === "band" ? String(bandId) : String(venueId))
      .replace(":created", shareSlug)
  );
}

test.describe("Public Routes - Accessibility (#1072)", () => {
  for (const surface of surfaces) {
    test(`${surface.label} has no axe violations`, async ({ page, request }) => {
      const ctx = {};
      if (surface.needs === "band") {
        ctx.bandId = await resolveBandId(request, "Future Sound");
      } else if (surface.needs === "venue") {
        ctx.venueId = await resolveVenueId(request);
      } else if (surface.needs === "share") {
        ctx.shareSlug = await createShareSlug(request, SEEDED_EVENTS.future);
      }

      const path = resolvePath(surface, ctx);
      await page.goto(path);
      await expect(surface.ready(page)).toBeVisible({ timeout: 15000 });

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

      const violations = getViolationSummary(results.violations);
      expect(violations, `axe violations on ${surface.label} (${path})`).toEqual([]);
    });
  }
});
