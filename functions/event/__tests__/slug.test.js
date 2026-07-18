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

describe("SSR /event/[slug] — per-day subEvent JSON-LD (#542 PR-4)", () => {
  test("multi-day event: subEvent array, one per festival day, each with that day's performers + dates", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Multi-Day Fest",
      slug: "slug-542-multiday",
      date: "2026-08-01",
    });
    rawDb.prepare("UPDATE events SET is_published=1, end_date=? WHERE id=?").run("2026-08-02", event.id);
    const venue = insertVenue(rawDb, { name: "Main Stage" });

    const day1Band = insertBand(rawDb, {
      name: "Day One Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-01", day1Band.id);

    const day2Band = insertBand(rawDb, {
      name: "Day Two Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-02", day2Band.id);

    const response = await onRequest(makeContext({ env, slug: "slug-542-multiday" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.subEvent).toHaveLength(2);

    const [subDay1, subDay2] = musicEvent.subEvent;
    expect(subDay1["@type"]).toBe("MusicEvent");
    expect(subDay1.startDate).toBe("2026-08-01T18:45:00-04:00");
    expect(subDay1.endDate).toBe("2026-08-01");
    expect(subDay1.performer).toEqual([
      { "@type": "MusicGroup", name: "Day One Band", url: expect.stringContaining("/band/") },
    ]);

    expect(subDay2.startDate).toBe("2026-08-02T18:45:00-04:00");
    expect(subDay2.endDate).toBe("2026-08-02");
    expect(subDay2.performer).toEqual([
      { "@type": "MusicGroup", name: "Day Two Band", url: expect.stringContaining("/band/") },
    ]);

    // Existing top-level performer list is unchanged — still both bands, not
    // just one day's worth (subEvent is additive, not a replacement).
    expect(musicEvent.performer).toHaveLength(2);
  });

  test("single-day event: no subEvent key at all (regression guard — output unchanged from #616/#617)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Single Night Show",
      slug: "slug-542-singleday",
      date: "2026-08-01",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Solo Venue" });
    insertBand(rawDb, { name: "Only Band", event_id: event.id, venue_id: venue.id });

    const response = await onRequest(makeContext({ env, slug: "slug-542-singleday" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.subEvent).toBeUndefined();
    expect(musicEvent.performer).toHaveLength(1);
  });

  test("an end_date equal to date (not actually multi-day) also gets no subEvent", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Same-Date Show",
      slug: "slug-542-same-date",
      date: "2026-08-01",
    });
    rawDb.prepare("UPDATE events SET is_published=1, end_date=? WHERE id=?").run("2026-08-01", event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-542-same-date" }));
    const html = await response.text();
    const [musicEvent] = extractJsonLd(html);
    expect(musicEvent.subEvent).toBeUndefined();
  });

  test("reveal-mode multi-day event: unannounced bands absent from both top-level performer AND every subEvent", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Reveal Mode Fest",
      slug: "slug-542-reveal",
      date: "2026-08-01",
    });
    rawDb.prepare("UPDATE events SET is_published=1, end_date=?, reveal_mode=1 WHERE id=?").run("2026-08-02", event.id);
    const venue = insertVenue(rawDb, { name: "Reveal Stage" });

    const announced = insertBand(rawDb, { name: "Announced Band", event_id: event.id, venue_id: venue.id });
    rawDb
      .prepare("UPDATE performances SET is_announced=1, performance_date=? WHERE id=?")
      .run("2026-08-01", announced.id);

    const hidden = insertBand(rawDb, { name: "Hidden Band", event_id: event.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=0, performance_date=? WHERE id=?").run("2026-08-01", hidden.id);

    const response = await onRequest(makeContext({ env, slug: "slug-542-reveal" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    const [musicEvent] = extractJsonLd(html);

    expect(musicEvent.performer).toHaveLength(1);
    expect(musicEvent.performer[0].name).toBe("Announced Band");
    expect(html).not.toContain("Hidden Band");

    const day1 = musicEvent.subEvent.find((d) => d.endDate === "2026-08-01");
    expect(day1.performer).toHaveLength(1);
    expect(day1.performer[0].name).toBe("Announced Band");

    // Day 2 has no announced performances at all — performer key is omitted
    // entirely (mirrors the top-level bands.length > 0 convention).
    const day2 = musicEvent.subEvent.find((d) => d.endDate === "2026-08-02");
    expect(day2.performer).toBeUndefined();
  });

  test("after-midnight set (start before 06:00) buckets into the PREVIOUS festival day's subEvent, not its own performance_date", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Late Night Fest",
      slug: "slug-542-after-midnight",
      date: "2026-08-01",
    });
    rawDb.prepare("UPDATE events SET is_published=1, end_date=? WHERE id=?").run("2026-08-02", event.id);
    const venue = insertVenue(rawDb, { name: "Late Stage" });

    // Stored with performance_date = the literal calendar date the 1 AM set
    // falls on (Aug 2) — but per the after-midnight convention (CLAUDE.md,
    // AFTER_MIDNIGHT_THRESHOLD_HOUR = 6) it's really part of Aug 1 evening's
    // lineup and must bucket into Day 1's subEvent, not Day 2's.
    const lateBand = insertBand(rawDb, {
      name: "After Midnight Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "01:00",
      end_time: "02:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-02", lateBand.id);

    const response = await onRequest(makeContext({ env, slug: "slug-542-after-midnight" }));
    const html = await response.text();
    const [musicEvent] = extractJsonLd(html);

    const day1 = musicEvent.subEvent.find((d) => d.endDate === "2026-08-01");
    const day2 = musicEvent.subEvent.find((d) => d.endDate === "2026-08-02");
    expect(day1.performer?.map((p) => p.name)).toEqual(["After Midnight Band"]);
    expect(day2.performer).toBeUndefined();
  });

  test("startDate uses the correct America/Toronto offset: -04:00 (EDT) in summer, -05:00 (EST) in winter (#542 PR-4, folded pre-existing bug)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const summerEvent = insertEvent(rawDb, { name: "Summer Show", slug: "slug-542-summer", date: "2026-08-02" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(summerEvent.id);

    // lwbc15 precedent (CLAUDE.md #542): a February event is EST, not EDT.
    const winterEvent = insertEvent(rawDb, { name: "Winter Show", slug: "slug-542-winter", date: "2026-02-14" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(winterEvent.id);

    const summerRes = await onRequest(makeContext({ env, slug: "slug-542-summer" }));
    const [summerMusicEvent] = extractJsonLd(await summerRes.text());
    expect(summerMusicEvent.startDate).toBe("2026-08-02T18:45:00-04:00");

    const winterRes = await onRequest(makeContext({ env, slug: "slug-542-winter" }));
    const [winterMusicEvent] = extractJsonLd(await winterRes.text());
    expect(winterMusicEvent.startDate).toBe("2026-02-14T18:45:00-05:00");
  });
});
