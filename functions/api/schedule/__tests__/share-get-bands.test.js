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
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
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

  test("falls back to the stored name when a performance was deleted after sharing", async () => {
    const { env, rawDb, event, venue } = seed();
    const kept = insertBand(rawDb, {
      name: "Kept Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:00",
      end_time: "21:30",
    });
    const removed = insertBand(rawDb, {
      name: "Removed Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "22:30",
    });

    insertShareLink(rawDb, {
      slug: "deleted01",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [kept.id, removed.id],
      band_names: ["Kept Band", "Removed Band"],
    });

    // Simulate the band being pulled from the lineup after the link was shared.
    rawDb.prepare("DELETE FROM performances WHERE id = ?").run(removed.id);

    const res = await onRequestGet({ request: makeRequest("deleted01"), params: { slug: "deleted01" }, env });
    const body = await res.json();

    // Dropping it would make the list disagree with the "N-stop route" heading
    // and the "Add N stops" button, both of which count band_names.
    expect(body.bands).toHaveLength(2);
    expect(body.bands[1]).toMatchObject({
      performance_id: removed.id,
      name: "Removed Band",
      start_time: null,
      venue: null,
    });
    expect(body.bands[0].start_time).toBe("21:00");
  });
});
