/**
 * SSR /venue/[id] Tests — venue city threading (#840)
 *
 * Until #767's fix reached the SSR surfaces, every venue page title claimed
 * "Waterloo, ON" and the MusicVenue JSON-LD hardcoded addressLocality
 * "Waterloo" regardless of the venue's own city (with a `|| "Waterloo"`
 * fallback where a venue.city read existed at all). Buddies Fest 2's Tillsonburg
 * venues rendered structured data asserting they were in Waterloo — false data
 * Google consumes. The class is fixed by threading the venue's own city through
 * and OMITTING the locality (never defaulting it) when the venue has no city.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[id].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../api/test-utils.js";

const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ env, id }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/venue/${id}`),
    env,
    params: { id: String(id) },
  };
}

function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return matches.map((m) => JSON.parse(m[1]));
}

function insertPublicVenue(rawDb, options) {
  const venue = insertVenue(rawDb, options);
  const event = insertEvent(rawDb, {
    name: "SSR Venue Event",
    slug: `ssr-venue-${venue.id}`,
    date: "2099-01-01",
    status: "published",
  });
  insertBand(rawDb, { name: `SSR Venue Band ${venue.id}`, event_id: event.id, venue_id: venue.id });
  return venue;
}

describe("SSR /venue/[id] — venue city threading (#840)", () => {
  test("title + JSON-LD use the venue's OWN city (Tillsonburg), never a hardcoded Waterloo", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertPublicVenue(rawDb, {
      name: "The Copper Mug",
      city: "Tillsonburg",
      region: "ON",
      address_line1: "79 Broadway Street",
    });

    const response = await onRequest(makeContext({ env, id: venue.id }));
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toContain("Live Music Venue in Tillsonburg, ON");
    expect(html).not.toContain("Waterloo");

    const [musicVenue] = extractJsonLd(html);
    expect(musicVenue["@type"]).toBe("MusicVenue");
    expect(musicVenue.address.addressLocality).toBe("Tillsonburg");
  });

  test("venue with no city: locality is OMITTED from JSON-LD and the title, never defaulted", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertPublicVenue(rawDb, { name: "No City Venue", city: null });

    const response = await onRequest(makeContext({ env, id: venue.id }));
    const html = await response.text();

    expect(html).not.toContain("Waterloo");
    expect(html).toContain("No City Venue — Live Music Venue | SetTimes");

    const [musicVenue] = extractJsonLd(html);
    expect(musicVenue.address).not.toHaveProperty("addressLocality");
  });

  test("an unannounced-only venue is a real 404, while reveal_mode=0 remains visible", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const hiddenVenue = insertVenue(rawDb, { name: "Hidden SSR Venue" });
    const hiddenEvent = insertEvent(rawDb, {
      name: "Hidden Venue Event",
      slug: "hidden-venue-event",
      date: "2099-01-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET reveal_mode = 1 WHERE id = ?").run(hiddenEvent.id);
    const hiddenBand = insertBand(rawDb, {
      name: "Hidden Venue Band",
      event_id: hiddenEvent.id,
      venue_id: hiddenVenue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(hiddenBand.id);

    const hiddenResponse = await onRequest(makeContext({ env, id: hiddenVenue.id }));
    expect(hiddenResponse.status).toBe(404);

    const openVenue = insertVenue(rawDb, { name: "Open SSR Venue" });
    const openEvent = insertEvent(rawDb, {
      name: "Open Venue Event",
      slug: "open-venue-event",
      date: "2099-01-01",
      status: "published",
    });
    const openBand = insertBand(rawDb, { name: "Open Venue Band", event_id: openEvent.id, venue_id: openVenue.id });
    rawDb.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(openBand.id);

    const openResponse = await onRequest(makeContext({ env, id: openVenue.id }));
    expect(openResponse.status).toBe(200);
    // The error fallback (ASSETS.fetch) is also a 200, so the status alone cannot
    // tell "rendered" from "the lookup threw": the venue's name must be in the page.
    expect(await openResponse.text()).toContain("Open SSR Venue");
  });
});
