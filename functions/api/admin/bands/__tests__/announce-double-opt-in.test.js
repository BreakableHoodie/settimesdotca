import { describe, expect, test, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context) => {
    const role = context?.data?.user?.role || context?.request?.headers?.get("x-test-role");
    if (!role) {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { error: false, user: { userId: 1, email: "admin@x.co", role }, userId: 1 };
  },
  auditLog: vi.fn(async () => {}),
}));

vi.mock("../../../../utils/email.js", () => ({
  isEmailConfigured: () => true,
  sendEmail: vi.fn(() => Promise.resolve({ delivered: true })),
}));

import { onRequestPost as resendAnnouncement } from "../[id]/resend-announcement.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";

/**
 * Band follows are double opt-in: `POST /api/bands/:name/follow` writes the row
 * `verified = 0` and sends only a confirmation email. Announcement mail targets
 * `verified = 1` rows ONLY, so an address the submitter does not control can
 * never be enrolled in the announcement stream — it receives at most one
 * confirmation. That is the whole anti-email-bombing property.
 *
 * Every other follower fixture in this suite seeds `verified = 1`, which means
 * deleting `AND verified = 1` from either recipient query left all 1,169
 * backend tests green. These tests exist to fail in exactly that case: each one
 * seeds an UNVERIFIED follower and asserts they are not reached.
 *
 * Two call sites carry the gate and both are covered here — the announce
 * transition in `bands/[id].js` and the recovery path in
 * `bands/[id]/resend-announcement.js`. Adding a third sender means adding a
 * third case here.
 */
describe("double opt-in gate — unverified followers are never enrolled in announcements", () => {
  test("announce transition does not queue an unverified follower", async () => {
    const bandIdHandler = await import("../[id].js");
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "Vol18", slug: "vol18-double-opt-in" });
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const perf = insertBand(rawDb, {
      name: "Opt In Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const unverifiedId = rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token) VALUES (?, ?, 0, ?, ?)",
      )
      .run("not-mine@example.com", perf.band_profile_id, "pending-token", "unsub-unverified").lastInsertRowid;

    const res = await bandIdHandler.onRequestPatch({
      request: new Request(`https://example.test/api/admin/bands/${perf.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ is_announced: true }),
      }),
      env,
      data: { user: { role: "editor", id: 2 } },
    });

    expect(res.status).toBe(200);

    const queued = rawDb.prepare("SELECT * FROM band_announce_queue WHERE band_follow_id=?").all(unverifiedId);
    expect(queued).toHaveLength(0);

    // With no eligible recipient the latch must stay clear, so confirming later
    // and re-announcing still reaches the (by then verified) follower.
    const perfRow = rawDb.prepare("SELECT band_follow_notified FROM performances WHERE id=?").get(perf.id);
    expect(perfRow.band_follow_notified).toBe(0);
  });

  test("announce transition queues only the verified follower when both exist", async () => {
    const bandIdHandler = await import("../[id].js");
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "Vol18", slug: "vol18-mixed-followers" });
    const venue = insertVenue(rawDb, { name: "Room 47" });
    const perf = insertBand(rawDb, {
      name: "Mixed Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const verifiedId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("confirmed@example.com", perf.band_profile_id, "unsub-verified").lastInsertRowid;
    const unverifiedId = rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token) VALUES (?, ?, 0, ?, ?)",
      )
      .run("not-mine@example.com", perf.band_profile_id, "pending-token", "unsub-unverified").lastInsertRowid;

    await bandIdHandler.onRequestPatch({
      request: new Request(`https://example.test/api/admin/bands/${perf.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ is_announced: true }),
      }),
      env,
      data: { user: { role: "editor", id: 2 } },
    });

    const queuedFollowIds = rawDb
      .prepare("SELECT band_follow_id FROM band_announce_queue WHERE performance_id=?")
      .all(perf.id)
      .map((r) => r.band_follow_id);

    expect(queuedFollowIds).toEqual([verifiedId]);
    expect(queuedFollowIds).not.toContain(unverifiedId);
  });

  test("resend-announcement does not email an unverified follower", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest-double-opt-in" });
    const venue = insertVenue(rawDb, { name: "Hall" });
    const perf = insertBand(rawDb, {
      name: "The Band",
      event_id: event.id,
      venue_id: venue.id,
    });

    const unverifiedId = rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token) VALUES (?, ?, 0, ?, ?)",
      )
      .run("not-mine@example.com", perf.band_profile_id, "pending-token", "unsub-unverified").lastInsertRowid;

    const res = await resendAnnouncement({
      request: new Request(`https://example.test/api/admin/bands/${perf.id}/resend-announcement`, {
        method: "POST",
        headers: { "x-test-role": "editor" },
      }),
      params: { id: String(perf.id) },
      env,
      data: { user: { userId: 1, email: "admin@x.co", role: "editor" } },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.failed).toBe(0);

    const notified = rawDb
      .prepare("SELECT band_follow_id FROM band_follow_notifications WHERE performance_id = ?")
      .all(perf.id);
    expect(notified).toHaveLength(0);
    expect(notified.map((r) => r.band_follow_id)).not.toContain(unverifiedId);
  });
});
