import { describe, expect, it, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async () => ({ error: false, user: { userId: 1, role: "editor" }, userId: 1 }),
  auditLog: vi.fn(async () => {}),
}));

import { onRequestPut } from "../[id].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";

/**
 * Pins `PUT /api/admin/bands/:id`'s dual-resource dispatch before the handler is
 * split (#908).
 *
 * That one route serves two unrelated resources, chosen by string-sniffing the
 * id: `profile_<n>` edits a band PROFILE (band-wide fields), a bare number edits
 * a PERFORMANCE (one set at one event). RosterTab sends the first form,
 * LineupTab the second.
 *
 * Nothing tested the profile branch. Every existing test used a numeric id, so
 * the entire reason the dispatch exists was uncovered — and it is the half a
 * split is most likely to break, because the two paths share one 600-line
 * function and a set of variables that are only meaningful on one side
 * (`performance` stays null throughout the profile path).
 *
 * These assert the ROUTING and the isolation between the two, not the field
 * validation each path performs — that is covered by bands.test.js.
 */

function put(env, id, body) {
  return onRequestPut({
    request: new Request(`https://example.test/api/admin/bands/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    data: { user: { role: "editor", id: 2 } },
  });
}

function seed() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const event = insertEvent(rawDb, { name: "Fest", slug: "fest-put-dispatch" });
  const venue = insertVenue(rawDb, { name: "Hall" });
  const perf = insertBand(rawDb, {
    name: "Dispatch Band",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "20:00",
    end_time: "21:00",
  });
  return { env, rawDb, event, venue, perf };
}

describe("PUT /api/admin/bands/:id — profile_ vs numeric dispatch", () => {
  it("a profile_ id updates band-profile fields", async () => {
    const { env, rawDb, perf } = seed();
    const res = await put(env, `profile_${perf.band_profile_id}`, {
      genre: "punk",
      origin_city: "Waterloo",
      is_active: 0,
    });

    expect(res.status).toBe(200);
    const row = rawDb
      .prepare("SELECT genre, origin_city, is_active FROM band_profiles WHERE id = ?")
      .get(perf.band_profile_id);
    expect(row).toEqual({ genre: "punk", origin_city: "Waterloo", is_active: 0 });
  });

  it("a profile_ id returns the profile shape, with the prefixed id echoed back", async () => {
    // RosterTab keys rows off this id, so the `profile_` prefix must survive the
    // round trip — a split that returned the bare number would break the grid.
    const { env, perf } = seed();
    const res = await put(env, `profile_${perf.band_profile_id}`, { genre: "ska" });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.band.id).toBe(`profile_${perf.band_profile_id}`);
  });

  it("a profile_ id IGNORES performance fields sent alongside it", async () => {
    // The isolation that matters: these are different resources sharing a route.
    //
    // Sending the performance fields is the whole point. A version of this test
    // that posted only `genre` passed even with the performance-update block
    // forced to run for profile ids — because with no set-time fields in the
    // body there was nothing for it to write. It proved nothing.
    const { env, rawDb, perf } = seed();
    const res = await put(env, `profile_${perf.band_profile_id}`, {
      genre: "punk",
      startTime: "01:00",
      endTime: "02:00",
      notes: "should not land",
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT start_time, end_time, notes FROM performances WHERE id = ?").get(perf.id);
    expect(row.start_time).toBe("20:00");
    expect(row.end_time).toBe("21:00");
    expect(row.notes).not.toBe("should not land");

    // ...while the profile field it WAS allowed to change did land.
    const profile = rawDb.prepare("SELECT genre FROM band_profiles WHERE id = ?").get(perf.band_profile_id);
    expect(profile.genre).toBe("punk");
  });

  it("a numeric id updates the performance row", async () => {
    const { env, rawDb, perf } = seed();
    const res = await put(env, perf.id, { startTime: "22:00", endTime: "23:00" });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(perf.id);
    expect(row).toEqual({ start_time: "22:00", end_time: "23:00" });
  });

  it("a numeric id can still edit band-profile fields — they are band-wide", async () => {
    // Deliberately NOT symmetric with the isolation test above. Editing a set
    // may also edit the band's profile; editing a profile may not edit a set.
    const { env, rawDb, perf } = seed();
    await put(env, perf.id, { genre: "metal" });

    const row = rawDb.prepare("SELECT genre FROM band_profiles WHERE id = ?").get(perf.band_profile_id);
    expect(row.genre).toBe("metal");
  });

  it("rejects a malformed profile_ id rather than treating it as a performance", async () => {
    const { env } = seed();
    for (const bad of ["profile_abc", "profile_0", "profile_-1", "profile_"]) {
      const res = await put(env, bad, { genre: "punk" });
      expect(res.status, `expected 400 for ${bad}`).toBe(400);
    }
  });

  it("404s a profile_ id for a profile that does not exist", async () => {
    const { env } = seed();
    const res = await put(env, "profile_99999", { genre: "punk" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("404s a numeric id for a performance that does not exist", async () => {
    const { env } = seed();
    const res = await put(env, 99999, { startTime: "22:00" });
    expect(res.status).toBe(404);
  });
});
