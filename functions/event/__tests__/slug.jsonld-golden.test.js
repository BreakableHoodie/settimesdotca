/**
 * JSON-LD golden snapshot — /event/[slug] MusicEvent + BreadcrumbList
 *
 * This is a golden-master test: it seeds ONE deterministic event and snapshots
 * the full parsed MusicEvent + BreadcrumbList JSON-LD objects the SSR route
 * emits. This structured data is crawler-facing and SEO-critical, and it
 * churned across 3 PRs this week (#504, #615, #616) with every existing test
 * asserting only individual fields — none asserted the FULL shape. A golden
 * snapshot makes every future change to this output visible as a diff in
 * code review, not just a passing/failing assertion on one field.
 *
 * The committed .snap file reflects MAIN's current output: organizer,
 * offers+validFrom, image, location, performer — deliberately NO subEvent
 * (#634's per-venue MusicEvent nesting is not merged as of this test's
 * creation).
 *
 * When a change to the JSON-LD shape is INTENTIONAL (e.g. #634 landing
 * subEvent), regenerate with:
 *   npx vitest run -u functions/event/__tests__/slug.jsonld-golden.test.js
 * then REVIEW the resulting snapshot diff before committing — the diff IS
 * the change under review. Never accept a snapshot update blindly.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[slug].js";
import { createTestEnv, insertEvent, insertBand, insertVenue } from "../../api/test-utils.js";

const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ env, slug }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/event/${slug}`),
    env,
    params: { slug },
  };
}

function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return matches.map((m) => JSON.parse(m[1]));
}

describe("JSON-LD golden snapshot — /event/[slug]", () => {
  test("MusicEvent + BreadcrumbList match the pinned golden shape", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Two venues, ordered by v.name in the route's query: Blue Room sorts
    // before Room 47 (B < R).
    const blueRoom = insertVenue(rawDb, {
      name: "Blue Room (Inside Revive Karaoke)",
      address_line1: "28 King St N",
      city: "Waterloo",
      region: "ON",
      postal_code: "N2J 2W7",
    });
    const room47 = insertVenue(rawDb, {
      name: "Room 47",
      address_line1: "47 King St N",
      city: "Waterloo",
      region: "ON",
      postal_code: "N2J 2W9",
    });

    const event = insertEvent(rawDb, {
      name: "Long Weekend Band Crawl - Vol. 17",
      slug: "golden-lwbc17",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(event.id);
    // Pin created_at: offers.validFrom is derived from it (see [slug].js),
    // so leaving the schema default (datetime('now')) would make the
    // snapshot re-run non-deterministic — a new validFrom every day.
    rawDb
      .prepare("UPDATE events SET description = ?, ticket_url = ?, poster_url = ?, created_at = ? WHERE id = ?")
      .run(
        "Six venues, one legendary night of live music in Waterloo Region.",
        "https://tickets.example.com/vol-17",
        "https://band-photos.settimes.ca/event-posters/17-vol17.jpg",
        "2026-07-01 12:00:00",
        event.id,
      );

    // Band names + insertion order deliberately exercise the article-strip
    // sort (#587): raw SQL `ORDER BY bp.name` would place these
    // "Midtown Static", "The Anti-Queens", "Zebra Sound" (M, T, Z) — but the
    // route re-sorts by the article-stripped key, so "The Anti-Queens" (key
    // "anti-queens") must move to FIRST place, not stay second.
    insertBand(rawDb, { name: "Midtown Static", event_id: event.id, venue_id: room47.id });
    insertBand(rawDb, { name: "The Anti-Queens", event_id: event.id, venue_id: blueRoom.id });
    insertBand(rawDb, { name: "Zebra Sound", event_id: event.id, venue_id: blueRoom.id });

    const response = await onRequest(makeContext({ env, slug: "golden-lwbc17" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent, breadcrumb] = extractJsonLd(html);
    expect(musicEvent).toMatchSnapshot();
    expect(breadcrumb).toMatchSnapshot();
  });
});
