import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertBand, insertVenue, insertShareLink } from "../../test-utils";
import * as stats from "../public.js";

function seedEnv() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  return { env, rawDb };
}

function publish(rawDb, eventId) {
  rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(eventId);
}

async function getStats(env) {
  return stats.onRequestGet({
    request: new Request("https://example.test/api/stats/public"),
    env,
  });
}

describe("Public aggregate stats - GET /api/stats/public", () => {
  it("returns aggregate counts/sums and top bands, with a 5-minute cache header", async () => {
    const { env, rawDb } = seedEnv();

    const venueA = insertVenue(rawDb, { name: "Roost", city: "Waterloo" });
    const venueB = insertVenue(rawDb, { name: "Blue Room", city: "Waterloo" });

    const published = insertEvent(rawDb, { name: "Vol 17", slug: "vol-17" });
    publish(rawDb, published.id);
    insertBand(rawDb, { name: "Band A", event_id: published.id, venue_id: venueA.id });
    insertBand(rawDb, { name: "Band B", event_id: published.id, venue_id: venueB.id });

    // A draft event's performances must not count toward published totals.
    const draft = insertEvent(rawDb, { name: "Draft Event", slug: "draft-evt", status: "draft" });
    insertBand(rawDb, { name: "Band C", event_id: draft.id, venue_id: venueA.id });

    // Inactive band must not count toward `bands` or appear in top_bands.
    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, is_active) VALUES (?, ?, 0)")
      .run("Retired Band", "retired band");

    // Give one band a nonzero popularity_score so top_bands ordering is exercised.
    rawDb.prepare("UPDATE band_profiles SET popularity_score = 42 WHERE name = ?").run("Band A");

    insertShareLink(rawDb, { slug: "share1", event_id: published.id, event_slug: "vol-17" });
    rawDb.prepare("UPDATE share_links SET view_count = 10 WHERE slug = 'share1'").run();
    insertShareLink(rawDb, { slug: "share2", event_id: published.id, event_slug: "vol-17" });
    rawDb.prepare("UPDATE share_links SET view_count = 5 WHERE slug = 'share2'").run();

    // Verified follow: counted. Unverified follow: must NOT be counted.
    const bandARow = rawDb.prepare("SELECT id FROM band_profiles WHERE name = ?").get("Band A");
    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("verified@example.test", bandARow.id, "unsub-token-1");
    rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token) VALUES (?, ?, 0, ?, ?)",
      )
      .run("unverified@example.test", bandARow.id, "verify-token-1", "unsub-token-2");

    rawDb.prepare("INSERT INTO page_views_daily (page, date, views) VALUES (?, ?, ?)").run("/", "2026-07-01", 100);
    rawDb.prepare("INSERT INTO page_views_daily (page, date, views) VALUES (?, ?, ?)").run("/about", "2026-07-01", 25);

    const res = await getStats(env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");

    const body = await res.json();

    expect(body.venues).toBe(2);
    expect(body.events).toBe(1); // only the published event
    expect(body.bands).toBe(3); // Band A, B, C — Retired Band excluded (is_active = 0)
    expect(body.performances).toBe(2); // only performances on the published event
    expect(body.routes_shared).toBe(2);
    expect(body.route_views).toBe(15);
    expect(body.fans_following).toBe(1); // only the verified follow
    expect(body.page_views).toBe(125);

    expect(body.top_bands.length).toBeGreaterThan(0);
    expect(body.top_bands.length).toBeLessThanOrEqual(8);
    expect(body.top_bands[0].name).toBe("Band A");
    expect(body.top_bands[0].score).toBe(42);
    expect(body.top_bands.some((b) => b.name === "Retired Band")).toBe(false);

    // top_bands entries must be display-only: no internal/DB id or other field leakage.
    for (const band of body.top_bands) {
      expect(Object.keys(band).sort()).toEqual(["name", "score", "slug"]);
      expect(band).not.toHaveProperty("id");
    }
  });

  it("never leaks PII-shaped fields anywhere in the response body", async () => {
    const { env, rawDb } = seedEnv();

    const venue = insertVenue(rawDb, { name: "Roost", city: "Waterloo" });
    const ev = insertEvent(rawDb, { name: "Vol 17", slug: "vol-17" });
    publish(rawDb, ev.id);
    const perf = insertBand(rawDb, { name: "Band A", event_id: ev.id, venue_id: venue.id });

    insertShareLink(rawDb, { slug: "share1", event_id: ev.id, event_slug: "vol-17" });

    rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, consent_ip) VALUES (?, ?, 1, ?, ?)",
      )
      .run("real.fan@example.test", perf.band_profile_id, "unsub-abc", "203.0.113.7");
    rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token, consent_ip) VALUES (?, ?, 0, ?, ?, ?)",
      )
      .run("pending.fan@example.test", perf.band_profile_id, "verify-xyz", "unsub-def", "203.0.113.8");

    const res = await getStats(env);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const lower = raw.toLowerCase();

    // Privacy guard (field names): these substrings would indicate a PII-bearing
    // column name (email, a token, consent metadata) leaking into the aggregate
    // response. `consent_ip` (not a bare "ip") is used so a band name that
    // happens to contain "ip" — e.g. "Skip", "Flip" — can't false-fail this.
    for (const forbidden of ["@", "token", "verification", "unsubscribe", "consent", "consent_ip", "email"]) {
      expect(lower).not.toContain(forbidden);
    }

    // Privacy guard (values): the concrete PII values we seeded above must never
    // appear verbatim either — this catches a value-only leak (e.g. selecting
    // consent_ip and echoing the address) that a field-name scan would miss.
    for (const secret of [
      "real.fan@example.test",
      "pending.fan@example.test",
      "203.0.113.7",
      "203.0.113.8",
      "unsub-abc",
      "unsub-def",
      "verify-xyz",
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("returns 503 when public data is gated off", async () => {
    const { env } = seedEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "false";
    const res = await getStats(env);
    expect(res.status).toBe(503);
  });

  it("returns zeroed aggregates (not an error) when there is no data yet", async () => {
    const { env } = seedEnv();
    const res = await getStats(env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bands).toBe(0);
    expect(body.venues).toBe(0);
    expect(body.events).toBe(0);
    expect(body.performances).toBe(0);
    expect(body.routes_shared).toBe(0);
    expect(body.route_views).toBe(0);
    expect(body.fans_following).toBe(0);
    expect(body.page_views).toBe(0);
    expect(body.top_bands).toEqual([]);
  });
});
