import { describe, test, expect } from "vitest";
import { onRequestGet } from "../stats/[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

// ---------------------------------------------------------------------------
// #779 — the `social` response contract of GET /api/bands/stats/{name}.
//
// This endpoint was the SIBLING in #779: it already returned all eight
// platforms, but it hand-built the key list exactly the way the broken
// /api/bands/{name} did, so the two could re-diverge. It now builds `social`
// from BAND_LINK_FIELD_KEYS (functions/utils/bandLinkFields.js).
//
// The equivalent tests in profile.test.js import `../[name].js` and therefore
// never execute THIS handler — the conversion here was covered only by the
// source-scanning guard (which proves no hand-written list remains, not that
// the replacement emits the right shape). These tests close that gap by
// exercising the stats handler directly.
// ---------------------------------------------------------------------------
describe("GET /api/bands/stats/:name - social key set equals the canonical eight (#779)", () => {
  // Order is NOT part of the response contract (`social` is a JSON object),
  // so both sides are sorted before comparing: this is a SET-equality check.
  // Hardcoded rather than imported from BAND_LINK_FIELD_KEYS on purpose —
  // same rationale as profile.test.js: a ninth platform added to the canonical
  // home must fail here, forcing a deliberate decision about whether it
  // belongs in the documented public shape.
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

  function seedBand(rawDb, { name, slug, social_links }) {
    const event = insertEvent(rawDb, { name: "Band Crawl Vol 17", slug, date: "2026-08-02" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, { name, event_id: event.id, venue_id: venue.id, social_links });
  }

  test("returns exactly the eight platform keys, even when an unknown ninth is stored", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    // All eight documented platforms plus a junk ninth that must NOT surface:
    // building from the canonical list (rather than reflecting stored JSON)
    // is what keeps a stale or foreign key out of the public shape.
    seedBand(rawDb, {
      name: "Stats Eight Platform Band",
      slug: "vol17-stats-779-keyset",
      social_links: JSON.stringify({
        website: "https://example.com/band",
        instagram: "the_band",
        bandcamp: "theband.bandcamp.com",
        facebook: "https://facebook.com/theband",
        youtube: "https://youtube.com/@theband",
        spotify: "https://open.spotify.com/artist/abc",
        apple_music: "https://music.apple.com/artist/abc",
        linktree: "https://linktr.ee/theband",
        myspace: "https://myspace.com/theband",
      }),
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Eight%20Platform%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload.social).sort()).toEqual(EXPECTED_SOCIAL_KEYS);
    expect(payload.social).not.toHaveProperty("myspace");
    // The four platforms /api/bands/{name} used to drop must round-trip here too.
    expect(payload.social.youtube).toBe("https://youtube.com/@theband");
    expect(payload.social.spotify).toBe("https://open.spotify.com/artist/abc");
    expect(payload.social.apple_music).toBe("https://music.apple.com/artist/abc");
    expect(payload.social.linktree).toBe("https://linktr.ee/theband");
  });

  test("returns all eight keys with null where a platform is absent", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    // Only two platforms stored; the other six must still appear, as null, so
    // external consumers always see a stable key set (do NOT switch this
    // endpoint to "only present keys" either).
    seedBand(rawDb, {
      name: "Stats Two Platform Band",
      slug: "vol17-stats-779-nulls",
      social_links: JSON.stringify({ website: "https://example.com/band", instagram: "the_band" }),
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Two%20Platform%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload.social).sort()).toEqual(EXPECTED_SOCIAL_KEYS);
    // Path-bearing URL: `normalizeHttpUrl` appends a trailing slash to a bare
    // origin, which is out of scope here — the contract under test is the
    // eight-keys-always shape, not URL normalization.
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
