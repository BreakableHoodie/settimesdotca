import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils";
import * as bandIdHandler from "../[id].js";

/**
 * CodeRabbit MAJOR 1 (#732) — a PATCH that both cancels and announces a
 * performance in the SAME request (or announces a performance that is
 * ALREADY cancelled) must never queue follower notifications. The guard at
 * the top of the notify branch checked `performance.is_announced === 0`
 * (the value BEFORE this request) but never looked at is_cancelled at all,
 * so a request body of `{ is_announced: true, is_cancelled: true }` claimed
 * the band_follow_notified latch and queued every verified follower for an
 * email about a set that is, by the time the email would go out, cancelled.
 *
 * The fix must read the EFFECTIVE (post-request) cancelled value, not the
 * stored one -- that's why there are two scenarios below: one where
 * cancellation arrives in the SAME request as the announce, and one where
 * the row was already cancelled before an announce-only request arrives.
 */
async function patchAs(env, performanceId, role, userId, body) {
  const req = new Request(`https://example.test/api/admin/bands/${performanceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return bandIdHandler.onRequestPatch({
    request: req,
    env,
    data: { user: { role, id: userId } },
  });
}

describe("PATCH /api/admin/bands/:id — cancel+announce race (#732)", () => {
  it("does not queue followers or claim the notify latch when one request both cancels and announces", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "Race Event", slug: "cancel-announce-race" });
    const venue = insertVenue(rawDb, { name: "Race Venue" });
    const band = insertBand(rawDb, { name: "Race Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced = 0, is_cancelled = 0 WHERE id = ?").run(band.id);

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("racer@example.com", band.band_profile_id, "unsub-race-1").lastInsertRowid;

    const res = await patchAs(env, band.id, "editor", 2, { is_announced: true, is_cancelled: true });
    expect(res.status).toBe(200);

    const row = rawDb
      .prepare("SELECT is_announced, is_cancelled, band_follow_notified FROM performances WHERE id = ?")
      .get(band.id);
    expect(row.is_cancelled).toBe(1);
    // The latch must stay unclaimed -- a cancelled set is never emailed to followers.
    expect(row.band_follow_notified).toBe(0);

    const queued = rawDb.prepare("SELECT * FROM band_announce_queue WHERE band_follow_id = ?").all(followId);
    expect(queued).toHaveLength(0);
  });

  it("does not queue followers when announcing a performance that was already cancelled", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "Race Event 2", slug: "cancel-announce-race-2" });
    const venue = insertVenue(rawDb, { name: "Race Venue 2" });
    const band = insertBand(rawDb, { name: "Race Band 2", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced = 0, is_cancelled = 1 WHERE id = ?").run(band.id);

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("racer2@example.com", band.band_profile_id, "unsub-race-2").lastInsertRowid;

    // Announce-only request -- hasCancelled is false, so the effective value
    // must come from the STORED row (already 1), not default to "not cancelled".
    const res = await patchAs(env, band.id, "editor", 2, { is_announced: true });
    expect(res.status).toBe(200);

    const row = rawDb
      .prepare("SELECT is_announced, is_cancelled, band_follow_notified FROM performances WHERE id = ?")
      .get(band.id);
    expect(row.is_announced).toBe(1);
    expect(row.band_follow_notified).toBe(0);

    const queued = rawDb.prepare("SELECT * FROM band_announce_queue WHERE band_follow_id = ?").all(followId);
    expect(queued).toHaveLength(0);
  });
});
