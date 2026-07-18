/**
 * SSR /event/[slug] Tests — MusicEvent JSON-LD ticket_url sanitization (#504)
 *
 * The route reflects `events.ticket_url` into the `offers.url` field of the
 * MusicEvent JSON-LD block. A pre-validation legacy value (e.g. a
 * javascript: scheme) must never reach the injected <script
 * type="application/ld+json"> — normalizeHttpUrl() drops the whole `offers`
 * block for anything that isn't a real http(s) URL.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[slug].js";
import { createTestEnv, insertEvent } from "../../api/test-utils.js";

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

describe("SSR /event/[slug] — MusicEvent JSON-LD ticket_url sanitization (#504)", () => {
  test("drops the offers block entirely for a legacy javascript: ticket_url", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Unsafe Ticket Event",
      slug: "slug-504-unsafe-ticket",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb
      .prepare("UPDATE events SET ticket_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504 read-path guard
      .run("javascript:alert(1)", event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-504-unsafe-ticket" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    // eslint-disable-next-line no-script-url -- assertion text, not an executed scheme
    expect(html).not.toContain("javascript:");

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent["@type"]).toBe("MusicEvent");
    expect(musicEvent.offers).toBeUndefined();
  });

  test("includes a sanitized offers.url for a normal https ticket_url", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Safe Ticket Event",
      slug: "slug-504-safe-ticket",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb.prepare("UPDATE events SET ticket_url = ? WHERE id = ?").run("https://tickets.example.com/crawl", event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-504-safe-ticket" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.offers).toBeDefined();
    expect(musicEvent.offers.url).toBe("https://tickets.example.com/crawl");
  });
});

describe("SSR /event/[slug] — MusicEvent JSON-LD enrichment (#615)", () => {
  test("emits full-URL eventStatus/eventAttendanceMode and an organizer block", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Enriched Event",
      slug: "slug-615-enriched",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-615-enriched" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(musicEvent.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(musicEvent.organizer).toEqual({
      "@type": "Organization",
      name: "SetTimes",
      url: "https://settimes.ca",
      sameAs: ["https://www.instagram.com/settimes.ca"],
    });
  });

  test("offers includes validFrom (from created_at) and priceCurrency, but never price", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Ticketed Event",
      slug: "slug-615-ticketed",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb.prepare("UPDATE events SET ticket_url = ? WHERE id = ?").run("https://tickets.example.com/crawl", event.id);

    const seededEvent = rawDb.prepare("SELECT created_at FROM events WHERE id = ?").get(event.id);
    const expectedValidFrom = seededEvent.created_at.slice(0, 10);

    const response = await onRequest(makeContext({ env, slug: "slug-615-ticketed" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.offers).toBeDefined();
    expect(musicEvent.offers.priceCurrency).toBe("CAD");
    expect(musicEvent.offers.validFrom).toBe(expectedValidFrom);
    expect(musicEvent.offers).not.toHaveProperty("price");
  });

  test("omits offers (and therefore validFrom) entirely when ticket_url is absent", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "No Ticket Event",
      slug: "slug-615-no-ticket",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-615-no-ticket" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.offers).toBeUndefined();
  });
});

describe("SSR /event/[slug] — poster_url image + og:image/twitter:image (#616)", () => {
  test("poster present: MusicEvent gets an image array and og:image/twitter:image are emitted", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Postered Event",
      slug: "slug-616-poster",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      .run("https://band-photos.settimes.ca/event-posters/1-vol17.jpg", event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-616-poster" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toContain(
      '<meta property="og:image" content="https://band-photos.settimes.ca/event-posters/1-vol17.jpg" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://band-photos.settimes.ca/event-posters/1-vol17.jpg" />',
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.image).toEqual(["https://band-photos.settimes.ca/event-posters/1-vol17.jpg"]);
  });

  test("poster absent: no image field, no og:image/twitter:image, twitter:card falls back to summary", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Posterless Event",
      slug: "slug-616-no-poster",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-616-no-poster" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).not.toContain('property="og:image"');
    expect(html).not.toContain('name="twitter:image"');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.image).toBeUndefined();
  });

  test("drops the image entirely for a legacy javascript: poster_url (#504-style read-path guard)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Unsafe Poster Event",
      slug: "slug-616-unsafe-poster",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504-style read-path guard
      .run("javascript:alert(1)", event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-616-unsafe-poster" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    // eslint-disable-next-line no-script-url -- assertion text, not an executed scheme
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('property="og:image"');

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.image).toBeUndefined();
  });
});
