import { describe, expect, test, vi } from "vitest";
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

  test("names every failed table while committing successful deletes", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES (?, 1, ?)")
      .run("expired-retention-session", 0);

    const originalPrepare = env.DB.prepare.bind(env.DB);
    const prepareSpy = vi.spyOn(env.DB, "prepare").mockImplementation((sql) => {
      const statement = originalPrepare(sql);
      if (sql.includes("DELETE FROM auth_attempts") || sql.includes("action != 'api_key.request'")) {
        return {
          ...statement,
          bind: (...params) => ({
            ...statement.bind(...params),
            run: () => Promise.reject(new Error("delete failed")),
          }),
          run: () => Promise.reject(new Error("delete failed")),
        };
      }
      return statement;
    });

    await expect(runRetentionCleanup(env)).rejects.toThrow("retention failed for: auth_attempts, audit_log");
    expect(rawDb.prepare("SELECT COUNT(*) AS count FROM lucia_sessions").get().count).toBe(1);
    prepareSpy.mockRestore();
  });

  // A statement can fail while being PREPARED, synchronously. Built eagerly,
  // that throw aborted the list before later tables were even started.
  test("a delete that throws while being prepared does not stop later tables", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    rawDb.prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES ('expired-prep', 1, 0)").run();

    const originalPrepare = env.DB.prepare.bind(env.DB);
    const prepareSpy = vi.spyOn(env.DB, "prepare").mockImplementation((sql) => {
      if (sql.includes("DELETE FROM mfa_challenges")) throw new Error("prepare failed");
      return originalPrepare(sql);
    });

    await expect(runRetentionCleanup(env)).rejects.toThrow("retention failed for: mfa_challenges");
    // lucia_sessions comes first and rate_limits last: both still ran.
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE id = 'expired-prep'").get().n).toBe(0);
    expect(prepareSpy.mock.calls.some(([sql]) => sql.includes("DELETE FROM rate_limits"))).toBe(true);
    prepareSpy.mockRestore();
  });
  describe("invitee email addresses (#1498)", () => {
    function seedInvite(rawDb, tag, { usedDaysAgo, expiresInDays, active = 1, createdDaysAgo = 0 }) {
      rawDb
        .prepare(
          `INSERT INTO invite_codes (code, code_prefix, email, role, created_at, used_at, expires_at, is_active)
           VALUES (?, 'abcd1234', ?, 'editor', datetime('now', ?),
                   CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END, datetime('now', ?), ?)`,
        )
        .run(
          `sha256:${tag}`,
          `${tag}@example.test`,
          `-${createdDaysAgo} days`,
          usedDaysAgo ?? null,
          `-${usedDaysAgo} days`,
          `${expiresInDays >= 0 ? "+" : ""}${expiresInDays} days`,
          active,
        );
    }
    const emails = (rawDb) =>
      Object.fromEntries(
        rawDb
          .prepare("SELECT code, email FROM invite_codes")
          .all()
          .map((r) => [r.code.replace("sha256:", ""), r.email]),
      );

    test("cleared 30 days after used, expired or revoked; kept before, and while live; the row stays", async () => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      rawDb.prepare("DELETE FROM invite_codes").run();
      seedInvite(rawDb, "used31", { usedDaysAgo: 31, expiresInDays: 100, createdDaysAgo: 40 });
      seedInvite(rawDb, "used29", { usedDaysAgo: 29, expiresInDays: 100, createdDaysAgo: 40 });
      seedInvite(rawDb, "expired31", { expiresInDays: -31, createdDaysAgo: 40 });
      seedInvite(rawDb, "expired29", { expiresInDays: -29, createdDaysAgo: 40 });
      seedInvite(rawDb, "revoked31", { expiresInDays: 100, active: 0, createdDaysAgo: 31 });
      seedInvite(rawDb, "revoked29", { expiresInDays: 100, active: 0, createdDaysAgo: 29 });
      seedInvite(rawDb, "live", { expiresInDays: 5, createdDaysAgo: 2 });
      seedInvite(rawDb, "liveold", { expiresInDays: 100, createdDaysAgo: 60 });

      const result = await runRetentionCleanup(env);

      expect(result.invite_emails_cleared).toBe(3);
      expect(emails(rawDb)).toEqual({
        used31: null,
        used29: "used29@example.test",
        expired31: null,
        expired29: "expired29@example.test",
        revoked31: null,
        revoked29: "revoked29@example.test",
        live: "live@example.test",
        liveold: "liveold@example.test",
      });
    });
  });
});
