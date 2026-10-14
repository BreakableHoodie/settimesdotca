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
});
