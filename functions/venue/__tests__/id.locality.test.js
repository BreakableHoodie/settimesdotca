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
import { createTestEnv, insertVenue } from "../../api/test-utils.js";

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

describe("SSR /venue/[id] — venue city threading (#840)", () => {
  test("title + JSON-LD use the venue's OWN city (Tillsonburg), never a hardcoded Waterloo", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertVenue(rawDb, {
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
    const venue = insertVenue(rawDb, { name: "No City Venue", city: null });

    const response = await onRequest(makeContext({ env, id: venue.id }));
    const html = await response.text();

    expect(html).not.toContain("Waterloo");
    expect(html).toContain("No City Venue — Live Music Venue | SetTimes");

    const [musicVenue] = extractJsonLd(html);
    expect(musicVenue.address).not.toHaveProperty("addressLocality");
  });
});
