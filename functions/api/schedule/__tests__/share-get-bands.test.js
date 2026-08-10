import { describe, expect, test } from "vitest";
import { onRequestGet } from "../share/[slug].js";
import { createTestEnv, insertEvent, insertVenue, insertBand, insertShareLink } from "../../test-utils.js";

// Coverage for the additive `bands` field on the share snapshot (times, venues,
// and the deleted-performance fallback). The pre-existing suite only asserted
// `performance_ids` / `band_names`, so a regression here would silently strip
// set times back out of every shared route.
describe("GET /api/schedule/share/[slug] — bands detail", () => {
  const makeRequest = (slug) => new Request(`https://example.test/api/schedule/share/${slug}`);

  function seed() {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Vol. 17", slug: "vol17" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    return { env, rawDb, event, venue };
  }

  test("returns set times and venue for each shared performance", async () => {
    const { env, rawDb, event, venue } = seed();
    const perf = insertBand(rawDb, {
      name: "Mixed Feelings",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "20:30",
    });

    insertShareLink(rawDb, {
      slug: "abc12345",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [perf.id],
      band_names: ["Mixed Feelings"],
    });

    const res = await onRequestGet({ request: makeRequest("abc12345"), params: { slug: "abc12345" }, env });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.bands).toHaveLength(1);
    expect(body.bands[0]).toMatchObject({
      performance_id: perf.id,
      name: "Mixed Feelings",
      start_time: "20:00",
      end_time: "20:30",
      venue: "Blue Room",
    });
    // performance_date drives the preview's festival-day sort on multi-day
    // events, so it has to be asserted, not just present in the shape.
    expect(body.bands[0]).toHaveProperty("performance_date");
    expect(body.bands[0].performance_date).toBe(perf.performance_date ?? null);
  });

  test("keeps performance_ids and band_names unchanged so the ?import=1 apply flow still works", async () => {
    const { env, rawDb, event, venue } = seed();
    const perf = insertBand(rawDb, {
      name: "Suplex",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "23:40",
      end_time: "00:10",
    });

    insertShareLink(rawDb, {
      slug: "keepshape",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [perf.id],
      band_names: ["Suplex"],
    });

    const res = await onRequestGet({ request: makeRequest("keepshape"), params: { slug: "keepshape" }, env });
    const body = await res.json();

    // App.jsx re-fetches this endpoint with ?import=1 and reads exactly these
    // two fields to apply a shared route. They must survive the `bands` addition.
    expect(body.performance_ids).toEqual([perf.id]);
    expect(body.band_names).toEqual(["Suplex"]);
  });

  // #733: a performance that no longer resolves is HARD-DELETED (a set added
  // in error, an event cleaned up). The pre-#733 behaviour above emitted the
  // stored name with a null time and venue -- an orphan that read as a
  // rendering bug, starkly so since #731 added times and venues to every
  // other row. `bands` now omits it instead; `performance_ids`/`band_names`
  // stay untouched so the ?import=1 apply path (App.jsx) is unaffected.
  function seedShareWithThreeSets() {
    const { env, rawDb, event, venue } = seed();
    const kept = insertBand(rawDb, {
      name: "Kept Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "20:30",
    });
    const cancelled = insertBand(rawDb, {
      name: "Cancelled Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:00",
      end_time: "21:30",
    });
    const deleted = insertBand(rawDb, {
      name: "Deleted Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "22:30",
    });

    insertShareLink(rawDb, {
      slug: "threesets",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [kept.id, cancelled.id, deleted.id],
      band_names: ["Kept Band", "Cancelled Band", "Deleted Band"],
    });

    const fetchShare = async () => {
      const res = await onRequestGet({
        request: makeRequest("threesets"),
        params: { slug: "threesets" },
        env,
      });
      return res.json();
    };

    return { db: rawDb, keptId: kept.id, cancelledId: cancelled.id, deletedId: deleted.id, fetchShare };
  }

  test("omits a hard-deleted performance instead of emitting a nameless orphan", async () => {
    const { db, deletedId, fetchShare } = seedShareWithThreeSets();

    const before = await fetchShare();
    expect(before.bands).toHaveLength(3);

    db.prepare("DELETE FROM performances WHERE id = ?").run(deletedId);

    const after = await fetchShare();
    expect(after.bands).toHaveLength(2);
    // The orphan signature: a row carrying a name but no time and no venue.
    expect(after.bands.some((b) => b.start_time === null && b.venue === null)).toBe(false);
  });

  test("returns performance_ids and band_names unchanged so ?import=1 stays index-aligned", async () => {
    const { db, deletedId, fetchShare } = seedShareWithThreeSets();
    const before = await fetchShare();

    db.prepare("DELETE FROM performances WHERE id = ?").run(deletedId);
    const after = await fetchShare();

    expect(after.performance_ids).toEqual(before.performance_ids);
    expect(after.band_names).toEqual(before.band_names);
  });

  test("KEEPS a cancelled performance with its real time and venue", async () => {
    const { db, cancelledId, fetchShare } = seedShareWithThreeSets();

    db.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelledId);

    const after = await fetchShare();
    const entry = after.bands.find((b) => b.performance_id === cancelledId);
    expect(entry).toBeDefined();
    expect(entry.is_cancelled).toBe(1);
    expect(entry.start_time).not.toBeNull();
    expect(entry.venue).not.toBeNull();
  });
});
