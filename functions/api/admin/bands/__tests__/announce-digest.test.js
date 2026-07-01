import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";
import { flushAnnounceDigest } from "../../../../utils/announceDigest.js";

vi.mock("../../../../utils/email.js", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ delivered: true })),
  isEmailConfigured: () => true,
}));

import { sendEmail } from "../../../../utils/email.js";

describe("flushAnnounceDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a single-band email when only one band is queued for a fan+event", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Fest", slug: "fest-single" });
    const venue = insertVenue(rawDb, { name: "Hall" });
    const perf = insertBand(rawDb, {
      name: "The Band",
      event_id: ev.id,
      venue_id: venue.id,
    });

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan@example.com", perf.band_profile_id, "tok-unsub").lastInsertRowid;

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followId, perf.id, ev.id, "The Band", "Fest", "fest-single", perf.band_profile_id);

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(0);
    expect(sendEmail).toHaveBeenCalledOnce();
    const [, { subject }] = sendEmail.mock.calls[0];
    expect(subject).toBe("The Band just joined the lineup for Fest!");

    // Queue entry consumed
    const remaining = rawDb.prepare("SELECT * FROM band_announce_queue").all();
    expect(remaining).toHaveLength(0);
    // Notification row recorded
    const notif = rawDb.prepare("SELECT * FROM band_follow_notifications").all();
    expect(notif).toHaveLength(1);
  });

  it("sends a digest when a fan follows multiple announced bands on the same event", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Crawl", slug: "crawl-digest" });
    const venue = insertVenue(rawDb, { name: "Stage" });

    const perfA = insertBand(rawDb, {
      name: "Band A",
      event_id: ev.id,
      venue_id: venue.id,
    });
    const perfB = insertBand(rawDb, {
      name: "Band B",
      event_id: ev.id,
      venue_id: venue.id,
    });

    const fanFollowA = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan@example.com", perfA.band_profile_id, "tok-a").lastInsertRowid;

    const fanFollowB = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan@example.com", perfB.band_profile_id, "tok-b").lastInsertRowid;

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(fanFollowA, perfA.id, ev.id, "Band A", "Crawl", "crawl-digest", perfA.band_profile_id);

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(fanFollowB, perfB.id, ev.id, "Band B", "Crawl", "crawl-digest", perfB.band_profile_id);

    const stats = await flushAnnounceDigest(env, env.DB);

    // One email for the fan, not two
    expect(stats.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();
    const [, { subject }] = sendEmail.mock.calls[0];
    expect(subject).toBe("2 bands you follow are playing Crawl!");

    // Both queue entries consumed, both notification rows written
    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);
    expect(rawDb.prepare("SELECT * FROM band_follow_notifications").all()).toHaveLength(2);
  });

  it("sends separate digests for different fans", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Fest", slug: "fest-fans" });
    const venue = insertVenue(rawDb, { name: "Spot" });
    const perf = insertBand(rawDb, {
      name: "Band X",
      event_id: ev.id,
      venue_id: venue.id,
    });

    const f1 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan1@example.com", perf.band_profile_id, "tok-f1").lastInsertRowid;

    const f2 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan2@example.com", perf.band_profile_id, "tok-f2").lastInsertRowid;

    for (const [followId, token] of [
      [f1, "tok-f1"],
      [f2, "tok-f2"],
    ]) {
      rawDb
        .prepare(
          `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(followId, perf.id, ev.id, "Band X", "Fest", "fest-fans", perf.band_profile_id);
    }

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.sent).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("returns empty stats when the queue is empty", async () => {
    const { env, rawDb } = createTestEnv();
    const stats = await flushAnnounceDigest(env, env.DB);
    expect(stats).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim and increments failed when send fails", async () => {
    const { env, rawDb } = createTestEnv();
    sendEmail.mockResolvedValueOnce({
      delivered: false,
      reason: "provider_error",
    });

    const ev = insertEvent(rawDb, { name: "Fest", slug: "fest-fail" });
    const venue = insertVenue(rawDb, { name: "Room" });
    const perf = insertBand(rawDb, {
      name: "Band Z",
      event_id: ev.id,
      venue_id: venue.id,
    });

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fail@example.com", perf.band_profile_id, "tok-z").lastInsertRowid;

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followId, perf.id, ev.id, "Band Z", "Fest", "fest-fail", perf.band_profile_id);

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.failed).toBe(1);
    // Queue consumed (won't retry via digest; resend-announcement handles recovery)
    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);
    // Claim released so resend-announcement can recover
    expect(rawDb.prepare("SELECT * FROM band_follow_notifications").all()).toHaveLength(0);
  });

  it("skips entries already claimed by a concurrent flush or resend", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Fest", slug: "fest-skip" });
    const venue = insertVenue(rawDb, { name: "Stage" });
    const perf = insertBand(rawDb, {
      name: "Band Q",
      event_id: ev.id,
      venue_id: venue.id,
    });

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("skip@example.com", perf.band_profile_id, "tok-q").lastInsertRowid;

    rawDb
      .prepare(
        `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(followId, perf.id, ev.id, "Band Q", "Fest", "fest-skip", perf.band_profile_id);

    // Simulate a concurrent resend that already claimed the notification row
    rawDb
      .prepare("INSERT INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)")
      .run(perf.id, followId);

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.skipped).toBe(1);
    expect(stats.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    // Queue entry still cleaned up
    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);
  });

  it("correctly tallies sent/failed/skipped across multiple groups when some sends fail", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Multi", slug: "multi-mixed" });
    const venue = insertVenue(rawDb, { name: "Hall" });

    const perfA = insertBand(rawDb, {
      name: "Band A",
      event_id: ev.id,
      venue_id: venue.id,
    });
    const perfB = insertBand(rawDb, {
      name: "Band B",
      event_id: ev.id,
      venue_id: venue.id,
    });
    const perfC = insertBand(rawDb, {
      name: "Band C",
      event_id: ev.id,
      venue_id: venue.id,
    });

    // fan1 follows Band A — send will succeed
    const f1 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan1@example.com", perfA.band_profile_id, "tok1").lastInsertRowid;

    // fan2 follows Band B — send will fail
    const f2 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan2@example.com", perfB.band_profile_id, "tok2").lastInsertRowid;

    // fan3 follows Band C — already claimed (skipped)
    const f3 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan3@example.com", perfC.band_profile_id, "tok3").lastInsertRowid;

    for (const [followId, perf] of [
      [f1, perfA],
      [f2, perfB],
      [f3, perfC],
    ]) {
      rawDb
        .prepare(
          `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(followId, perf.id, ev.id, perf.name ?? "Band", "Multi", "multi-mixed", perf.band_profile_id);
    }

    // Pre-claim fan3's slot to simulate concurrent flush
    rawDb
      .prepare("INSERT INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)")
      .run(perfC.id, f3);

    // First call succeeds (fan1), second fails (fan2)
    sendEmail
      .mockResolvedValueOnce({ delivered: true })
      .mockResolvedValueOnce({ delivered: false, reason: "provider_error" });

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.skipped).toBe(1);

    // All queue entries consumed
    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);

    // fan1's notification row kept; fan2's released; fan3's pre-existing row kept
    const notifs = rawDb.prepare("SELECT band_follow_id FROM band_follow_notifications ORDER BY band_follow_id").all();
    const followIds = notifs.map((n) => n.band_follow_id);
    expect(followIds).toContain(Number(f1));
    expect(followIds).not.toContain(Number(f2)); // released on failure
    expect(followIds).toContain(Number(f3)); // pre-existing, untouched
  });

  it("releases all claims for a failed group so resend can recover the whole digest", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Fest", slug: "fest-release" });
    const venue = insertVenue(rawDb, { name: "Stage" });

    const perfA = insertBand(rawDb, {
      name: "BandR1",
      event_id: ev.id,
      venue_id: venue.id,
    });
    const perfB = insertBand(rawDb, {
      name: "BandR2",
      event_id: ev.id,
      venue_id: venue.id,
    });

    const f1 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("release@example.com", perfA.band_profile_id, "tok-r1").lastInsertRowid;

    const f2 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("release@example.com", perfB.band_profile_id, "tok-r2").lastInsertRowid;

    for (const [followId, perf] of [
      [f1, perfA],
      [f2, perfB],
    ]) {
      rawDb
        .prepare(
          `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(followId, perf.id, ev.id, perf.name ?? "Band", "Fest", "fest-release", perf.band_profile_id);
    }

    sendEmail.mockResolvedValueOnce({ delivered: false });

    const stats = await flushAnnounceDigest(env, env.DB);

    expect(stats.failed).toBe(1);
    expect(stats.sent).toBe(0);

    // Both claims for the failed digest group must be released
    expect(rawDb.prepare("SELECT * FROM band_follow_notifications").all()).toHaveLength(0);
    // Queue entries consumed regardless of send outcome
    expect(rawDb.prepare("SELECT * FROM band_announce_queue").all()).toHaveLength(0);
  });
});
