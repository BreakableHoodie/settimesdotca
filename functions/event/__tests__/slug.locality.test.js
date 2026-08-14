/**
 * SSR /event/[slug] Tests — venue city threading (#840)
 *
 * The MusicEvent JSON-LD `location` (per-venue MusicVenue addresses) fell back
 * to a hardcoded "Waterloo" addressLocality when a venue had no city, and the
 * route's <title> asserted "in Waterloo" unconditionally. Buddies Fest 2
 * (event 36, archived, Tillsonburg) proved the class: its venues emitted
 * structured data placing them in Waterloo. The fix threads each venue's own
 * city through and OMITS the locality (never a default) when it is absent.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[slug].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../api/test-utils.js";

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

describe("SSR /event/[slug] — venue city threading (#840)", () => {
  test("location JSON-LD uses each venue's OWN city (Tillsonburg), never a hardcoded Waterloo", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Buddies Fest 2",
      slug: "slug-840-tillsonburg",
      date: "2026-08-07",
    });
    rawDb.prepare("UPDATE events SET status = 'published', city=? WHERE id=?").run("Tillsonburg, ON", event.id);

    const venue = insertVenue(rawDb, {
      name: "The Copper Mug",
      city: "Tillsonburg",
      region: "ON",
      address_line1: "79 Broadway Street",
    });
    insertBand(rawDb, { name: "Copper Mug Headliner", event_id: event.id, venue_id: venue.id });

    const response = await onRequest(makeContext({ env, slug: "slug-840-tillsonburg" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.location).toHaveLength(1);
    expect(musicEvent.location[0].address.addressLocality).toBe("Tillsonburg");

    // The <title> threads the event's own city too — never a bare "in Waterloo".
    expect(html).toContain("Buddies Fest 2 — Set Times &amp; Lineup in Tillsonburg, ON | SetTimes");
    expect(html).not.toContain('"addressLocality":"Waterloo"');
    expect(html).not.toContain("in Waterloo |");
  });

  test("venue with no city: addressLocality is omitted, not defaulted to Waterloo", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Cityless Venue Fest",
      slug: "slug-840-cityless-venue",
      date: "2026-08-07",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "No City Stage", city: null });
    insertBand(rawDb, { name: "Cityless Headliner", event_id: event.id, venue_id: venue.id });

    const response = await onRequest(makeContext({ env, slug: "slug-840-cityless-venue" }));
    const html = await response.text();
    const [musicEvent] = extractJsonLd(html);

    expect(musicEvent.location).toHaveLength(1);
    expect(musicEvent.location[0].address).not.toHaveProperty("addressLocality");
    expect(html).toContain("Cityless Venue Fest — Set Times &amp; Lineup | SetTimes");
    expect(html).not.toContain('"addressLocality":"Waterloo"');
    expect(html).not.toContain("in Waterloo |");
  });

  test("event with no venues: fallback Place threads event.city, omits locality when the event has none", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Lineup TBA",
      slug: "slug-840-novenue",
      date: "2026-10-11",
    });
    rawDb.prepare("UPDATE events SET status = 'published', city=? WHERE id=?").run("Tillsonburg, ON", event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-840-novenue" }));
    const html = await response.text();
    const [musicEvent] = extractJsonLd(html);

    expect(musicEvent.location["@type"]).toBe("Place");
    expect(musicEvent.location.address.addressLocality).toBe("Tillsonburg, ON");
    expect(html).toContain("Lineup TBA — Set Times &amp; Lineup in Tillsonburg, ON | SetTimes");
    expect(html).not.toContain('"addressLocality":"Waterloo"');

    const cityless = insertEvent(rawDb, {
      name: "Cityless Event",
      slug: "slug-840-cityless-event",
      date: "2026-10-11",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(cityless.id);

    const citylessRes = await onRequest(makeContext({ env, slug: "slug-840-cityless-event" }));
    const citylessHtml = await citylessRes.text();
    const [citylessMusicEvent] = extractJsonLd(citylessHtml);
    expect(citylessMusicEvent.location["@type"]).toBe("Place");
    expect(citylessMusicEvent.location.address).not.toHaveProperty("addressLocality");
    expect(citylessHtml).toContain("Cityless Event — Set Times &amp; Lineup | SetTimes");
    expect(citylessHtml).not.toContain('"addressLocality":"Waterloo"');
  });
});
