import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import { runRetentionCleanup } from "../retention.js";

// The privacy policy publishes these windows. Until this file, deleting or
// widening either of them left every backend test green: the cross-table test
// in cleanup-sessions.test.js seeds no auth_attempts rows and no
// api_key.request rows. Each window is pinned on both sides of its boundary,
// so neither "never deletes" nor "deletes everything" passes.

function seedAttempt(rawDb, ageDays, email) {
  rawDb
    .prepare(
      "INSERT INTO auth_attempts (email, ip_address, attempt_type, success, created_at) VALUES (?, '1.2.3.4', 'login', 0, datetime('now', ?))",
    )
    .run(email, `-${ageDays} days`);
}

function seedAudit(rawDb, action, ageDays) {
  rawDb
    .prepare("INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, datetime('now', ?))")
    .run(action, `-${ageDays} days`);
}

function seedFollow(rawDb, email, ageDays, verified = 0) {
  const band = rawDb.prepare("SELECT id FROM band_profiles LIMIT 1").get();
  rawDb
    .prepare(
      "INSERT INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(email, band.id, verified, `${email}-verify`, `${email}-unsubscribe`, `-${ageDays} days`);
}

function seedSubscription(rawDb, email, ageDays, verified = 0) {
  rawDb
    .prepare(
      "INSERT INTO email_subscriptions (email, city, genre, verification_token, unsubscribe_token, verified, created_at) VALUES (?, 'all', 'all', ?, ?, ?, datetime('now', ?))",
    )
    .run(email, `${email}-verify`, `${email}-unsubscribe`, verified, `-${ageDays} days`);
}

describe("retention windows published in the privacy policy", () => {
  test("login attempts (emails, IPs) are kept 30 days and no longer", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    seedAttempt(rawDb, 29, "recent@example.test");
    seedAttempt(rawDb, 31, "old@example.test");

    const result = await runRetentionCleanup(env);

    expect(result.auth_attempts_deleted).toBe(1);
    const emails = rawDb
      .prepare("SELECT email FROM auth_attempts ORDER BY email")
      .all()
      .map((r) => r.email);
    expect(emails).toEqual(["recent@example.test"]);
  });

  test("api_key.request rows are kept 90 days, while other audit rows keep their 1 year", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    rawDb.prepare("DELETE FROM audit_log").run();
    seedAudit(rawDb, "api_key.request", 89);
    seedAudit(rawDb, "api_key.request", 91);
    seedAudit(rawDb, "event.updated", 91);

    const result = await runRetentionCleanup(env);

    expect(result.api_key_requests_deleted).toBe(1);
    expect(result.audit_log_deleted).toBe(0);
    const rows = rawDb
      .prepare(
        "SELECT action, CAST(julianday('now') - julianday(created_at) AS INTEGER) AS age FROM audit_log ORDER BY action, age",
      )
      .all();
    expect(rows).toEqual([
      { action: "api_key.request", age: 89 },
      { action: "event.updated", age: 91 },
    ]);
  });

  test("unconfirmed follow and subscription requests are kept 7 days, while verified rows are retained", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const band = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES ('Retention Band', 'retention-band')")
      .run();
    expect(band.lastInsertRowid).toBeTruthy();
    seedFollow(rawDb, "old-follow@example.test", 8);
    seedFollow(rawDb, "recent-follow@example.test", 6);
    seedFollow(rawDb, "verified-follow@example.test", 365, 1);
    seedSubscription(rawDb, "old-subscription@example.test", 8);
    seedSubscription(rawDb, "recent-subscription@example.test", 6);
    seedSubscription(rawDb, "verified-subscription@example.test", 365, 1);

    const result = await runRetentionCleanup(env);

    expect(result.band_follows_deleted).toBe(1);
    expect(result.email_subscriptions_deleted).toBe(1);
    expect(
      rawDb
        .prepare("SELECT email FROM band_follows ORDER BY email")
        .all()
        .map((r) => r.email),
    ).toEqual(["recent-follow@example.test", "verified-follow@example.test"]);
    expect(
      rawDb
        .prepare("SELECT email FROM email_subscriptions ORDER BY email")
        .all()
        .map((r) => r.email),
    ).toEqual(["recent-subscription@example.test", "verified-subscription@example.test"]);
  });
});
