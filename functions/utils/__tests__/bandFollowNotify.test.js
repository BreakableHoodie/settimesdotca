import { describe, expect, test, vi, afterEach } from "vitest";

vi.mock("../email.js", async (importOriginal) => ({
  // The real header builder, so these tests cannot drift from its format.
  listUnsubscribeHeaders: (await importOriginal()).listUnsubscribeHeaders,
  sendEmail: vi.fn(),
}));

import { sendEmail } from "../email.js";
import { notifyBandFollowers } from "../bandFollowNotify.js";
import { toSqliteDateTime } from "../authAttempts.js";
import { unsubscribeToken, UNSUBSCRIBE_KINDS } from "../unsubscribeLinks.js";
import * as loggerModule from "../logger.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../api/test-utils.js";

describe("notifyBandFollowers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // restoreAllMocks restores SPIES; it does not reset the call history of a
    // vi.fn() from a module mock factory, so sendEmail's calls accumulated
    // across tests. Any assertion on a call COUNT then measured the whole file.
    vi.clearAllMocks();
  });
  test("records a notification for each delivered email and skips failures", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    const venue = insertVenue(rawDb, { name: "Hall" });
    const perf = insertBand(rawDb, {
      name: "The Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    const bandProfileId = perf.band_profile_id;

    const f1 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("a@example.com", bandProfileId, "tok-a").lastInsertRowid;
    const f2 = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("b@example.com", bandProfileId, "tok-b").lastInsertRowid;

    // First delivers, second fails.
    sendEmail.mockImplementation((_env, { to }) =>
      Promise.resolve(to === "a@example.com" ? { delivered: true, deduplicated: true } : { delivered: false }),
    );

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId,
      bandName: "The Band",
      eventName: "Fest",
      followers: [
        { id: f1, email: "a@example.com", unsubscribe_token: "tok-a" },
        { id: f2, email: "b@example.com", unsubscribe_token: "tok-b" },
      ],
    });

    expect(result).toEqual({ sent: 1, failed: 1 });
    // Sends run concurrently, so find a@'s mail by recipient, not call order.
    const mail = sendEmail.mock.calls.find(([, m]) => m.to === "a@example.com")[1];
    expect(mail.idempotencyKey).toBe(`band-follow:${perf.id}:${f1}`);
    const bodyUrl = mail.text.match(/Unfollow: (\S+)/)[1];
    expect(bodyUrl).toBe(
      `${env.PUBLIC_URL || "https://settimes.ca"}/api/bands/${bandProfileId}/unfollow?token=${await unsubscribeToken(
        env,
        UNSUBSCRIBE_KINDS.bandFollow,
        f1,
      )}`,
    );
    expect(mail.text).not.toContain("tok-a");
    expect(mail.headers["List-Unsubscribe"]).toBe(`<${bodyUrl}>`);

    const notified = rawDb
      .prepare("SELECT band_follow_id FROM band_follow_notifications WHERE performance_id = ? ORDER BY band_follow_id")
      .all(perf.id);
    expect(notified.map((r) => r.band_follow_id)).toEqual([f1]);
    expect(
      rawDb
        .prepare("SELECT delivered_at FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
        .get(perf.id, f1).delivered_at,
    ).not.toBeNull();
  });

  test("skips followers already claimed by another concurrent request", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Test", slug: "test" });
    const venue = insertVenue(rawDb, { name: "Venue" });
    const perf = insertBand(rawDb, {
      name: "Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    const bandProfileId = perf.band_profile_id;

    const fId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan@example.com", bandProfileId, "tok").lastInsertRowid;

    // Pre-claim the follower as if another concurrent request already did
    rawDb
      .prepare("INSERT INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)")
      .run(perf.id, fId);

    sendEmail.mockReset();
    sendEmail.mockImplementation(() => Promise.resolve({ delivered: true }));

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId,
      bandName: "Band",
      eventName: "Test",
      followers: [{ id: fId, email: "fan@example.com", unsubscribe_token: "tok" }],
    });

    expect(result).toEqual({ sent: 0, failed: 1 });
    // sendEmail should not have been called — the race was won by the other request
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("logs a warning when any notification fails", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Test", slug: "test" });
    const venue = insertVenue(rawDb, { name: "Venue" });
    const perf = insertBand(rawDb, {
      name: "Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    const bandProfileId = perf.band_profile_id;

    const fId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan@example.com", bandProfileId, "tok").lastInsertRowid;

    sendEmail.mockReset();
    sendEmail.mockImplementation(() => Promise.resolve({ delivered: false }));

    const warnSpy = vi.spyOn(loggerModule.logger, "warn");

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId,
      bandName: "Band",
      eventName: "Test",
      followers: [{ id: fId, email: "fan@example.com", unsubscribe_token: "tok" }],
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("partially failed"),
      expect.objectContaining({
        performanceId: perf.id,
        failed: result.failed,
      }),
    );
  });

  test("releases claim when email fails so resend can retry", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Test", slug: "test" });
    const venue = insertVenue(rawDb, { name: "Venue" });
    const perf = insertBand(rawDb, {
      name: "Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    const bandProfileId = perf.band_profile_id;

    const fId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("fan@example.com", bandProfileId, "tok").lastInsertRowid;

    sendEmail.mockReset();
    sendEmail.mockImplementation(() => Promise.resolve({ delivered: false }));

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId,
      bandName: "Band",
      eventName: "Test",
      followers: [{ id: fId, email: "fan@example.com", unsubscribe_token: "tok" }],
    });

    expect(result).toEqual({ sent: 0, failed: 1 });

    // The claim row should have been deleted — resend will pick up this follower
    const rows = rawDb
      .prepare("SELECT id FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .all(perf.id, fId);
    expect(rows).toHaveLength(0);
  });

  test("failed send does not release a claim taken over during delivery", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Test", slug: "test" });
    const venue = insertVenue(rawDb, { name: "Venue" });
    const perf = insertBand(rawDb, { name: "Band", event_id: event.id, venue_id: venue.id });
    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("takeover@example.com", perf.band_profile_id, "tok-takeover").lastInsertRowid;
    const takeoverClaimedAt = toSqliteDateTime(new Date(Date.now() - 60_000));

    sendEmail.mockImplementationOnce(async () => {
      rawDb
        .prepare("UPDATE band_follow_notifications SET claimed_at = ? WHERE performance_id = ? AND band_follow_id = ?")
        .run(takeoverClaimedAt, perf.id, followId);
      return { delivered: false };
    });

    await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId: perf.band_profile_id,
      bandName: "Band",
      eventName: "Test",
      followers: [{ id: followId, email: "takeover@example.com", unsubscribe_token: "tok-takeover" }],
    });

    expect(
      rawDb
        .prepare(
          "SELECT claimed_at, delivered_at FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?",
        )
        .get(perf.id, followId),
    ).toEqual({ claimed_at: takeoverClaimedAt, delivered_at: null });
  });

  test("failed send does not release a row delivered during delivery", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Test", slug: "test" });
    const venue = insertVenue(rawDb, { name: "Venue" });
    const perf = insertBand(rawDb, { name: "Band", event_id: event.id, venue_id: venue.id });
    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("delivered@example.com", perf.band_profile_id, "tok-delivered").lastInsertRowid;
    const deliveredAt = toSqliteDateTime(new Date(Date.now() - 30_000));

    sendEmail.mockImplementationOnce(async () => {
      rawDb
        .prepare(
          "UPDATE band_follow_notifications SET delivered_at = ? WHERE performance_id = ? AND band_follow_id = ?",
        )
        .run(deliveredAt, perf.id, followId);
      return { delivered: false };
    });

    await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId: perf.band_profile_id,
      bandName: "Band",
      eventName: "Test",
      followers: [{ id: followId, email: "delivered@example.com", unsubscribe_token: "tok-delivered" }],
    });

    expect(
      rawDb
        .prepare("SELECT delivered_at FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
        .get(perf.id, followId),
    ).toEqual({ delivered_at: deliveredAt });
  });
  // Sender-level companions to the handler tests in
  // api/admin/bands/__tests__/resend-announcement.test.js.
  //
  // They exist BECAUSE the handler tests cannot prove these lines. The read
  // filter and the takeover's own delivered_at check are each independently
  // sufficient to stop a re-send, so breaking either one alone leaves every
  // handler test green -- verified by mutation, not assumed. Calling the
  // sender directly puts exactly one guard in play, which is what makes these
  // two able to fail.
  //
  // Both assert on sendEmail -- the side effect that actually reaches a
  // person -- rather than only the returned counts.
  test("takes over a claim that was never delivered and is past its lease", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    const venue = insertVenue(rawDb, { name: "Hall" });
    const perf = insertBand(rawDb, { name: "The Band", event_id: event.id, venue_id: venue.id });

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("stranded@example.com", perf.band_profile_id, "tok-s").lastInsertRowid;

    // Exactly what a Worker killed between claiming and sending leaves behind.
    rawDb
      .prepare(
        `INSERT INTO band_follow_notifications (performance_id, band_follow_id, claimed_at, delivered_at)
         VALUES (?, ?, datetime('now', '-60 minutes'), NULL)`,
      )
      .run(perf.id, followId);

    sendEmail.mockResolvedValue({ delivered: true });

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId: perf.band_profile_id,
      bandName: "The Band",
      eventName: "Fest",
      followers: [{ id: followId, email: "stranded@example.com", unsubscribe_token: "tok-s" }],
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);

    const row = rawDb
      .prepare("SELECT delivered_at FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
      .get(perf.id, followId);
    expect(row.delivered_at).not.toBeNull();
  });

  test("never takes over a delivered row, however old the claim", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    const venue = insertVenue(rawDb, { name: "Hall" });
    const perf = insertBand(rawDb, { name: "The Band", event_id: event.id, venue_id: venue.id });

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("done@example.com", perf.band_profile_id, "tok-d").lastInsertRowid;

    // A year past its lease -- but delivered. Age must not make it retryable,
    // or the first resend after the lease re-mails the whole history.
    rawDb
      .prepare(
        `INSERT INTO band_follow_notifications (performance_id, band_follow_id, claimed_at, delivered_at)
         VALUES (?, ?, datetime('now', '-365 days'), datetime('now', '-365 days'))`,
      )
      .run(perf.id, followId);

    sendEmail.mockResolvedValue({ delivered: true });

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId: perf.band_profile_id,
      bandName: "The Band",
      eventName: "Fest",
      followers: [{ id: followId, email: "done@example.com", unsubscribe_token: "tok-d" }],
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
  // Failure-path code, so it is tested by BREAKING the thing it guards. The
  // happy path never runs this catch, so a green suite says nothing about it.
  test("counts a send as sent when the delivery-confirmation write fails", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    const venue = insertVenue(rawDb, { name: "Hall" });
    const perf = insertBand(rawDb, { name: "The Band", event_id: event.id, venue_id: venue.id });

    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("confirm-fails@example.com", perf.band_profile_id, "tok-c").lastInsertRowid;

    sendEmail.mockResolvedValue({ delivered: true });
    const errorSpy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {});

    // Break ONLY the confirmation write; the claim must still work, or the
    // test would prove nothing about this branch.
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("SET delivered_at")) {
        throw new Error("D1 write failed");
      }
      return realPrepare(sql);
    };

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId: perf.band_profile_id,
      bandName: "The Band",
      eventName: "Fest",
      followers: [{ id: followId, email: "confirm-fails@example.com", unsubscribe_token: "tok-c" }],
    });

    // The email went out. Reporting it failed would invite the resend that is
    // the one action turning a lost write into a duplicate (#1153).
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  test("without the link key it sends nothing and leaves no claim behind (#1415)", async () => {
    const { env, rawDb } = createTestEnv();
    delete env.UNSUBSCRIBE_LINK_SECRET;
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest-nokey" });
    const perf = insertBand(rawDb, { name: "The Band", event_id: event.id });
    const followId = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("a@example.com", perf.band_profile_id, "tok-nokey").lastInsertRowid;
    const errorSpy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {});

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId: perf.band_profile_id,
      bandName: "The Band",
      eventName: "Fest",
      followers: [{ id: followId, email: "a@example.com" }],
    });

    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follow_notifications").get().n).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("cannot build an unsubscribe link"),
      expect.anything(),
    );
  });
});
