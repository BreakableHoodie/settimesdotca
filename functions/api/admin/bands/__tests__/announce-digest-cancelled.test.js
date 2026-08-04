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

/**
 * The top-level SELECT (announceDigest.js ~line 35) reads `is_cancelled`
 * ONCE for every queued row, up front. Phase A's per-group loop then claims
 * sequentially, group by group, awaiting a real DB.batch() round-trip each
 * time. A performance can be cancelled by an editor in the gap AFTER that
 * one-time SELECT already read is_cancelled=0 for it, but BEFORE its own
 * group's turn in the loop — invisible to the group's `item.is_cancelled`
 * snapshot, since that snapshot was taken before the cancellation landed.
 *
 * The tests above (re-checks cancellation at send time) cover cancellation
 * landing BEFORE the SELECT runs at all — the SELECT's join already handles
 * that case. This describe block covers the narrower, later window: the
 * claim itself must re-check cancellation at execution time, not trust the
 * SELECT's snapshot, because check-then-send can never close a DB-read vs.
 * network-send race — only making the claim's own write conditional can.
 */
describe("flushAnnounceDigest — the claim itself re-checks cancellation, closing the post-SELECT race (#732)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Poisons env.DB.batch so that, immediately after the FIRST group's real
  // claim+delete batch resolves, it cancels a performance belonging to a
  // LATER group — reproducing the exact ordering of the race: group 2 is
  // claimed strictly after group 1's DB.batch() call returns.
  function cancelAfterFirstBatch(env, rawDb, performanceId) {
    const originalBatch = env.DB.batch.bind(env.DB);
    let fired = false;
    return vi.spyOn(env.DB, "batch").mockImplementation(async (statements) => {
      const result = await originalBatch(statements);
      if (!fired) {
        fired = true;
        rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(performanceId);
      }
      return result;
    });
  }

  it("never emails a performance cancelled after the SELECT but before its own claim, and leaves no ledger row for it", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Mid-Flush Fest", slug: "digest-midflush-race" });
    const venue = insertVenue(rawDb, { name: "Race Hall" });

    // Group A sorts first ("a-..." < "z-..." in the flush's own
    // `ORDER BY q.event_id, bf.email, q.queued_at`) and is untouched — its
    // claim+delete batch is what triggers the mid-flush cancellation of
    // group B, which is claimed strictly after.
    const perfA = insertBand(rawDb, { name: "Early Band", event_id: ev.id, venue_id: venue.id });
    const perfB = insertBand(rawDb, { name: "Doomed Band", event_id: ev.id, venue_id: venue.id });

    const followA = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("a-midflush@example.com", perfA.band_profile_id, "tok-midflush-a").lastInsertRowid;
    const followB = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("z-midflush@example.com", perfB.band_profile_id, "tok-midflush-b").lastInsertRowid;

    for (const [followId, perf, name] of [
      [followA, perfA, "Early Band"],
      [followB, perfB, "Doomed Band"],
    ]) {
      rawDb
        .prepare(
          `INSERT INTO band_announce_queue
           (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(followId, perf.id, ev.id, name, ev.name, ev.slug, perf.band_profile_id);
    }

    const queueRowB = rawDb.prepare("SELECT id FROM band_announce_queue WHERE band_follow_id = ?").get(followB);

    const batchSpy = cancelAfterFirstBatch(env, rawDb, perfB.id);

    try {
      const stats = await flushAnnounceDigest(env, env.DB);

      // Only group A's (unaffected) email goes out.
      expect(sendEmail).toHaveBeenCalledOnce();
      const [, { subject }] = sendEmail.mock.calls[0];
      expect(subject).toContain("Early Band");
      expect(stats.sent).toBe(1);

      // Property 2 (load-bearing): the mid-flush-cancelled performance must
      // leave NO ledger row. A claimed-but-never-sent row would permanently
      // exclude this follower from resend-announcement's recovery query
      // (which only looks for followers WITHOUT a notification row) even
      // after the set is later restored and re-announced.
      const claim = rawDb
        .prepare("SELECT * FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
        .get(perfB.id, followB);
      expect(claim).toBeUndefined();

      // Property 3: its queue row is still swept — a cancelled entry must
      // not accumulate as a dead row forever.
      const remaining = rawDb.prepare("SELECT id FROM band_announce_queue WHERE id = ?").get(queueRowB.id);
      expect(remaining).toBeUndefined();
    } finally {
      batchSpy.mockRestore();
    }
  });

  it("lets restore-then-announce reach the fan after a mid-flush cancellation, mirroring the pre-SELECT race's recovery path", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Mid-Flush Restore Fest", slug: "digest-midflush-restore" });
    const venue = insertVenue(rawDb, { name: "Race Hall" });

    const perfA = insertBand(rawDb, { name: "Early Band", event_id: ev.id, venue_id: venue.id });
    const perfB = insertBand(rawDb, { name: "Doomed Band", event_id: ev.id, venue_id: venue.id });

    const followA = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("a-midflush-restore@example.com", perfA.band_profile_id, "tok-midflush-restore-a").lastInsertRowid;
    const followB = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("z-midflush-restore@example.com", perfB.band_profile_id, "tok-midflush-restore-b").lastInsertRowid;

    for (const [followId, perf, name] of [
      [followA, perfA, "Early Band"],
      [followB, perfB, "Doomed Band"],
    ]) {
      rawDb
        .prepare(
          `INSERT INTO band_announce_queue
           (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(followId, perf.id, ev.id, name, ev.name, ev.slug, perf.band_profile_id);
    }

    const batchSpy = cancelAfterFirstBatch(env, rawDb, perfB.id);
    try {
      const firstFlush = await flushAnnounceDigest(env, env.DB);
      expect(firstFlush.sent).toBe(1); // group A only
    } finally {
      batchSpy.mockRestore();
    }

    // Restore the set and queue it again — UNIQUE(band_follow_id,
    // performance_id) on band_announce_queue requires the earlier row to be
    // gone, which the digest's own sweep already guaranteed.
    rawDb.prepare("UPDATE performances SET is_cancelled = 0 WHERE id = ?").run(perfB.id);
    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followB, perfB.id, ev.id, "Doomed Band", ev.name, ev.slug, perfB.band_profile_id);

    const secondFlush = await flushAnnounceDigest(env, env.DB);
    expect(secondFlush.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(2); // 1 from first flush + 1 from second

    const claim = rawDb
      .prepare("SELECT * FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .get(perfB.id, followB);
    expect(claim).toBeDefined();
  });
});
