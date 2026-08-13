import { describe, test, expect } from "vitest";
import { onRequestGet } from "../[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("GET /api/bands/:name - reveal_mode gate", () => {
  test("hides unannounced performance when reveal_mode=1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-1",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const perf = insertBand(rawDb, {
      name: "Embargoed Artist",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/Embargoed%20Artist");
    const response = await onRequestGet({ request, env, params: {} });

    // The only performance is embargoed — band appears to have no performances
    // so the handler returns 404 (same as "band not found")
    expect(response.status).toBe(404);
  });

  test("shows announced performance when reveal_mode=1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-2",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    const perf = insertBand(rawDb, {
      name: "Revealed Artist",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/Revealed%20Artist");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.performances).toHaveLength(1);
    expect(payload.performances[0].event_slug).toBe("vol17-band-profile-2");
  });

  test("shows unannounced performance when reveal_mode=0", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Normal Event",
      slug: "vol17-band-profile-3",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode=0 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Revive Karaoke" });
    const perf = insertBand(rawDb, {
      name: "Normal Artist",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/Normal%20Artist");
    const response = await onRequestGet({ request, env, params: {} });

    // reveal_mode=0: unannounced performances still visible
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.performances).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// #483 — social link URLs reflected from DB without read-path scheme
// validation. `social_links` is seeded via a direct SQL insert (through
// insertBand's `social_links` param) to simulate a legacy/bypassed row that
// predates the write-path guard, since the write path itself now rejects
// unsafe schemes.
// ---------------------------------------------------------------------------
describe("GET /api/bands/:name - social_links scheme sanitization (#483)", () => {
  test("nulls a javascript: scheme website but preserves a plain instagram handle", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-483-unsafe",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, {
      name: "Scheme Test Band",
      event_id: event.id,
      venue_id: venue.id,
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #483 read-path guard
      social_links: JSON.stringify({ website: "javascript:alert(1)", instagram: "the_band" }),
    });

    const request = new Request("https://example.test/api/bands/Scheme%20Test%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.social.website).toBeNull();
    expect(payload.social.instagram).toBe("the_band");
  });

  test("passes a valid https website through unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-483-safe",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, {
      name: "Valid Site Band",
      event_id: event.id,
      venue_id: venue.id,
      social_links: JSON.stringify({ website: "https://example.com/band" }),
    });

    const request = new Request("https://example.test/api/bands/Valid%20Site%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.social.website).toBe("https://example.com/band");
  });
});

// ---------------------------------------------------------------------------
// #779 — `GET /api/bands/{name}` used to hand-list only four of the eight
// stored social-link platforms (website, instagram, bandcamp, facebook),
// silently dropping youtube, spotify, apple_music and linktree. The fix
// builds `social` from `BAND_LINK_FIELD_KEYS` (functions/utils/bandLinkFields.js).
//
// This is a snapshot guard on the RESPONSE CONTRACT, NOT a mirror of the
// canonical list: the eight expected keys are HARDCODED here on purpose.
// A ninth platform added to the canonical home but NOT yet blessed as a
// stable public contract will fail this test loudly — forcing a deliberate
// decision about whether the new key is part of the documented API shape
// before it reaches external consumers. (Mirrors the registry-shape snapshot
// in frontend/src/admin/utils/__tests__/bandFields.test.js, which hardcodes
// the same eight in render order.)
// ---------------------------------------------------------------------------
describe("GET /api/bands/:name - social key set equals the canonical eight (#779)", () => {
  // Order is NOT part of the response contract (`social` is a JSON object),
  // so both sides are sorted before comparing: this is a SET-equality check.
  const EXPECTED_SOCIAL_KEYS = [
    "website",
    "instagram",
    "bandcamp",
    "facebook",
    "youtube",
    "spotify",
    "apple_music",
    "linktree",
  ].sort();

  test("returns exactly the eight platform keys, even when an unknown ninth is stored", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-779-keyset",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    // Seed ALL eight documented platforms plus a junk ninth ("myspace") that
    // must NOT surface — the response contract is the canonical eight, so a
    // stale/legacy/foreign key in the stored JSON cannot leak a new field
    // into the public API shape.
    insertBand(rawDb, {
      name: "Eight Platform Band",
      event_id: event.id,
      venue_id: venue.id,
      social_links: JSON.stringify({
        website: "https://example.com",
        instagram: "the_band",
        bandcamp: "theband.bandcamp.com",
        facebook: "https://facebook.com/theband",
        youtube: "https://youtube.com/@theband",
        spotify: "https://open.spotify.com/artist/abc",
        apple_music: "https://music.apple.com/artist/abc",
        linktree: "https://linktr.ee/theband",
        // Junk ninth key — must not appear in the response.
        myspace: "https://myspace.com/theband",
      }),
    });

    const request = new Request("https://example.test/api/bands/Eight%20Platform%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload.social).sort()).toEqual(EXPECTED_SOCIAL_KEYS);
    // The junk key must not leak.
    expect(payload.social).not.toHaveProperty("myspace");
    // Every documented platform round-trips its stored value.
    expect(payload.social.youtube).toBe("https://youtube.com/@theband");
    expect(payload.social.spotify).toBe("https://open.spotify.com/artist/abc");
    expect(payload.social.apple_music).toBe("https://music.apple.com/artist/abc");
    expect(payload.social.linktree).toBe("https://linktr.ee/theband");
  });

  test("returns all eight keys with null where a platform is absent", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-779-nulls",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    // Only two platforms are stored; the other six must still appear, as null,
    // so external consumers always see a stable key set (the documented
    // contract — do NOT switch to "only present keys").
    insertBand(rawDb, {
      name: "Two Platform Band",
      event_id: event.id,
      venue_id: venue.id,
      social_links: JSON.stringify({ website: "https://example.com/band", instagram: "the_band" }),
    });

    const request = new Request("https://example.test/api/bands/Two%20Platform%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload.social).sort()).toEqual(EXPECTED_SOCIAL_KEYS);
    // `safeReflectSocialLinks` normalizes `website` via `normalizeHttpUrl`
    // (out of scope here — leave untouched), so a path-bearing URL is used so
    // the round-trip value is stable. The platform-PRESENCE contract under
    // test is the eight-keys-always shape, not URL normalization.
    expect(payload.social.website).toBe("https://example.com/band");
    expect(payload.social.instagram).toBe("the_band");
    expect(payload.social.youtube).toBeNull();
    expect(payload.social.spotify).toBeNull();
    expect(payload.social.apple_music).toBeNull();
    expect(payload.social.linktree).toBeNull();
    expect(payload.social.bandcamp).toBeNull();
    expect(payload.social.facebook).toBeNull();
  });
});
