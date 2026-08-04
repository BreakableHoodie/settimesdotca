import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";
import { flushAnnounceDigest } from "../../../../utils/announceDigest.js";

vi.mock("../../../../utils/email.js", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ delivered: true })),
  isEmailConfigured: () => true,
}));

import { sendEmail } from "../../../../utils/email.js";

/**
 * CodeRabbit MAJOR 1 (#732), digest half — announceDigest.js's SELECT never
 * joined `performances`, so a performance cancelled AFTER it was queued but
 * BEFORE the digest flush ran still went out: queue a follower, cancel the
 * set, flush — the fan got emailed about a set that is, at send time, off.
 *
 * Rows are inserted directly against band_announce_queue (bypassing the
 * admin PATCH endpoint's own hygiene delete, added alongside this fix) so
 * these tests isolate the digest's OWN re-check at send time — the second
 * layer of defense for the case where cancellation lands in the gap between
 * the queue insert and the flush's read.
 */
describe("flushAnnounceDigest — re-checks cancellation at send time (#732 MAJOR 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function queueFollower(rawDb, { email, token, perf, ev }) {
    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run(email, perf.band_profile_id, token).lastInsertRowid;

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followId, perf.id, ev.id, perf.name, ev.name, ev.slug, perf.band_profile_id);

    return followId;
  }

  it("sends nothing for a performance cancelled between queuing and flush, and clears its queue row", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Race Fest", slug: "digest-cancel-race" });
    const venue = insertVenue(rawDb, { name: "Race Hall" });
    const perf = insertBand(rawDb, { name: "Doomed Band", event_id: ev.id, venue_id: venue.id });

    const followId = queueFollower(rawDb, { email: "fan@example.com", token: "tok-doomed", perf, ev });

    // The race: cancellation lands AFTER queuing, BEFORE the flush reads the queue.
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(perf.id);

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.sent).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();

    // Queue is still cleaned up — a cancelled entry must not accumulate as a
    // dead row forever.
    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);

    // The notification ledger must NOT be claimed for a cancelled set — a
    // claimed-but-never-sent row would permanently exclude this follower from
    // resend-announcement's recovery query even after the set is restored.
    const claim = rawDb
      .prepare("SELECT * FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .get(perf.id, followId);
    expect(claim).toBeUndefined();
  });

  it("lets restore-then-announce reach the fan: a fresh queue entry for the same pair sends normally once the set is un-cancelled", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Restore Fest", slug: "digest-cancel-restore" });
    const venue = insertVenue(rawDb, { name: "Restore Hall" });
    const perf = insertBand(rawDb, { name: "Restored Band", event_id: ev.id, venue_id: venue.id });

    const followId = queueFollower(rawDb, { email: "restore@example.com", token: "tok-restore", perf, ev });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(perf.id);

    const firstFlush = await flushAnnounceDigest(env, env.DB);
    expect(firstFlush.sent).toBe(0);

    // Restore the set and queue it again — UNIQUE(band_follow_id, performance_id)
    // requires the earlier row to be gone, which the digest's cleanup above
    // already guaranteed.
    rawDb.prepare("UPDATE performances SET is_cancelled = 0 WHERE id = ?").run(perf.id);
    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followId, perf.id, ev.id, perf.name, ev.name, ev.slug, perf.band_profile_id);

    const secondFlush = await flushAnnounceDigest(env, env.DB);

    expect(secondFlush.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();

    const claim = rawDb
      .prepare("SELECT * FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .get(perf.id, followId);
    expect(claim).toBeDefined();
  });

  it("sends only the non-cancelled band when one fan's digest group mixes a cancelled and a live performance", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Mixed Fest", slug: "digest-cancel-mixed" });
    const venue = insertVenue(rawDb, { name: "Mixed Hall" });

    const cancelledPerf = insertBand(rawDb, { name: "Cancelled Band", event_id: ev.id, venue_id: venue.id });
    const livePerf = insertBand(rawDb, { name: "Live Band", event_id: ev.id, venue_id: venue.id });

    const followA = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("mixed@example.com", cancelledPerf.band_profile_id, "tok-mixed-a").lastInsertRowid;
    const followB = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("mixed@example.com", livePerf.band_profile_id, "tok-mixed-b").lastInsertRowid;

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followA, cancelledPerf.id, ev.id, "Cancelled Band", ev.name, ev.slug, cancelledPerf.band_profile_id);
    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followB, livePerf.id, ev.id, "Live Band", ev.name, ev.slug, livePerf.band_profile_id);

    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelledPerf.id);

    const stats = await flushAnnounceDigest(env, env.DB);

    // One email for the fan, mentioning only the live band — a broken
    // implementation that skips the whole group on ANY cancelled item would
    // also report sent=0 here, and one that ignores cancellation entirely
    // would still report sent=1 but with BOTH bands in the subject. The
    // subject content, not just the count, is what proves the fix is precise.
    expect(stats.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();
    const [, { subject }] = sendEmail.mock.calls[0];
    expect(subject).toBe("Live Band just joined the lineup for Mixed Fest!");
    expect(subject).not.toContain("Cancelled Band");

    const cancelledClaim = rawDb
      .prepare("SELECT * FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .get(cancelledPerf.id, followA);
    expect(cancelledClaim).toBeUndefined();

    const liveClaim = rawDb
      .prepare("SELECT * FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .get(livePerf.id, followB);
    expect(liveClaim).toBeDefined();

    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);
  });
});
