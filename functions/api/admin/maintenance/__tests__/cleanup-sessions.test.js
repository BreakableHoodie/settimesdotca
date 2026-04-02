import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import { onRequestPost } from "../cleanup-sessions.js";

describe("POST /api/admin/maintenance/cleanup-sessions", () => {
  test("admin can run retention cleanup across all tables", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    const activeAt = Math.floor(Date.now() / 1000) + 60 * 60;

    // Expired session
    rawDb
      .prepare(
        "INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
      )
      .run("expired-token", 1, expiredAt, "127.0.0.1", "test-agent");

    // Active session — should survive
    rawDb
      .prepare(
        "INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
      )
      .run("active-token", 1, activeAt, "127.0.0.1", "test-agent");

    // Old auth_audit row (>90 days)
    rawDb
      .prepare(
        "INSERT INTO auth_audit (timestamp, action, success, ip_address) VALUES (datetime('now', '-91 days'), 'login_attempt', 0, '1.2.3.4')",
      )
      .run();

    // Recent auth_audit row — should survive
    rawDb
      .prepare(
        "INSERT INTO auth_audit (timestamp, action, success, ip_address) VALUES (datetime('now', '-1 day'), 'login_attempt', 1, '1.2.3.4')",
      )
      .run();

    // Old audit_log row (>1 year)
    rawDb
      .prepare(
        "INSERT INTO audit_log (user_id, action, created_at) VALUES (1, 'event.updated', datetime('now', '-366 days'))",
      )
      .run();

    // Recent audit_log row — should survive
    rawDb
      .prepare(
        "INSERT INTO audit_log (user_id, action, created_at) VALUES (1, 'event.updated', datetime('now', '-1 day'))",
      )
      .run();

    // Stale rate_limits row (updated >30 min ago)
    const staleUpdatedAt = Math.floor(Date.now() / 1000) - 2000;
    rawDb
      .prepare(
        "INSERT INTO rate_limits (key, count, window_start, updated_at) VALUES (?, 5, ?, ?)",
      )
      .run("1.2.3.4:/api/auth", staleUpdatedAt, staleUpdatedAt);

    // Recent rate_limits row — should survive
    const recentUpdatedAt = Math.floor(Date.now() / 1000) - 60;
    rawDb
      .prepare(
        "INSERT INTO rate_limits (key, count, window_start, updated_at) VALUES (?, 1, ?, ?)",
      )
      .run("5.6.7.8:/api/auth", recentUpdatedAt, recentUpdatedAt);

    const request = new Request(
      "https://example.test/api/admin/maintenance/cleanup-sessions",
      { method: "POST", headers },
    );

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.sessions_deleted).toBe(1);
    expect(payload.auth_audit_deleted).toBe(1);
    expect(payload.audit_log_deleted).toBe(1);
    expect(payload.rate_limits_deleted).toBe(1);

    // Active rows must survive
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE id = ?").get("active-token").c).toBe(1);
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE id = ?").get("expired-token").c).toBe(0);

    const auditEntry = rawDb
      .prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = ?")
      .get("maintenance.cleanup");
    expect(auditEntry.c).toBe(1);
  });

  test("non-admin requests are forbidden", async () => {
    const { env, headers } = createTestEnv({ role: "viewer" });
    const request = new Request(
      "https://example.test/api/admin/maintenance/cleanup-sessions",
      { method: "POST", headers },
    );

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(403);
  });
});
