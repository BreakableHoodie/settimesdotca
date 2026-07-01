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
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)")
      .run("expired-token", 1, expiredAt, "127.0.0.1", "test-agent");

    // Active session — should survive
    rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)")
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

    // Used MFA challenge — should be deleted
    rawDb
      .prepare(
        "INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at, used, used_at) VALUES (?, ?, ?, ?, datetime('now', '+1 day'), 1, datetime('now', '-1 minute'))",
      )
      .run("used-mfa-token", 1, "1.2.3.4", "test-agent");

    // Active MFA challenge — should survive
    rawDb
      .prepare(
        "INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at, used) VALUES (?, ?, ?, ?, datetime('now', '+1 day'), 0)",
      )
      .run("active-mfa-token", 1, "1.2.3.4", "test-agent");

    // Expired email OTP — should be deleted
    rawDb
      .prepare(
        "INSERT INTO email_otp_codes (user_id, code, expires_at, used) VALUES (?, ?, datetime('now', '-1 minute'), 0)",
      )
      .run(1, "123456");

    // Active email OTP — should survive
    rawDb
      .prepare(
        "INSERT INTO email_otp_codes (user_id, code, expires_at, used) VALUES (?, ?, datetime('now', '+10 minutes'), 0)",
      )
      .run(1, "654321");

    // Used password reset token — should be deleted
    rawDb
      .prepare(
        "INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, used, used_at, ip_address) VALUES (?, ?, ?, datetime('now', '+1 day'), 1, datetime('now', '-1 minute'), ?)",
      )
      .run(1, "used-reset-token", 1, "1.2.3.4");

    // Active password reset token — should survive
    rawDb
      .prepare(
        "INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, used, ip_address) VALUES (?, ?, ?, datetime('now', '+1 day'), 0, ?)",
      )
      .run(1, "active-reset-token", 1, "1.2.3.4");

    // Expired trusted device — should be deleted
    rawDb
      .prepare(
        "INSERT INTO trusted_devices (user_id, token, device_fingerprint, ip_address, user_agent, expires_at, last_used_at) VALUES (?, ?, 'fp-expired', '1.2.3.4', 'Mozilla/5.0', datetime('now', '-1 day'), datetime('now', '-2 days'))",
      )
      .run(1, "expired-device-token");

    // Active trusted device — should survive
    rawDb
      .prepare(
        "INSERT INTO trusted_devices (user_id, token, device_fingerprint, ip_address, user_agent, expires_at, last_used_at) VALUES (?, ?, 'fp-active', '1.2.3.4', 'Mozilla/5.0', datetime('now', '+30 days'), datetime('now'))",
      )
      .run(1, "active-device-token");

    // Stale rate_limits row (updated >30 min ago)
    const staleUpdatedAt = Math.floor(Date.now() / 1000) - 2000;
    rawDb
      .prepare("INSERT INTO rate_limits (key, count, window_start, updated_at) VALUES (?, 5, ?, ?)")
      .run("1.2.3.4:/api/auth", staleUpdatedAt, staleUpdatedAt);

    // Recent rate_limits row — should survive
    const recentUpdatedAt = Math.floor(Date.now() / 1000) - 60;
    rawDb
      .prepare("INSERT INTO rate_limits (key, count, window_start, updated_at) VALUES (?, 1, ?, ?)")
      .run("5.6.7.8:/api/auth", recentUpdatedAt, recentUpdatedAt);

    const request = new Request("https://example.test/api/admin/maintenance/cleanup-sessions", {
      method: "POST",
      headers,
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.sessions_deleted).toBe(1);
    expect(payload.mfa_challenges_deleted).toBe(1);
    expect(payload.email_otp_codes_deleted).toBe(1);
    expect(payload.password_reset_tokens_deleted).toBe(1);
    expect(payload.trusted_devices_deleted).toBe(1);
    expect(payload.auth_audit_deleted).toBe(1);
    expect(payload.audit_log_deleted).toBe(1);
    expect(payload.rate_limits_deleted).toBe(1);

    // Active rows must survive
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE id = ?").get("active-token").c).toBe(1);
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE id = ?").get("expired-token").c).toBe(0);
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM mfa_challenges WHERE token = ?").get("active-mfa-token").c).toBe(1);
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM mfa_challenges WHERE token = ?").get("used-mfa-token").c).toBe(0);
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM email_otp_codes WHERE code = ?").get("654321").c).toBe(1);
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM email_otp_codes WHERE code = ?").get("123456").c).toBe(0);
    expect(
      rawDb.prepare("SELECT COUNT(*) as c FROM password_reset_tokens WHERE token = ?").get("active-reset-token").c,
    ).toBe(1);
    expect(
      rawDb.prepare("SELECT COUNT(*) as c FROM password_reset_tokens WHERE token = ?").get("used-reset-token").c,
    ).toBe(0);
    expect(
      rawDb.prepare("SELECT COUNT(*) as c FROM trusted_devices WHERE token = ?").get("active-device-token").c,
    ).toBe(1);
    expect(
      rawDb.prepare("SELECT COUNT(*) as c FROM trusted_devices WHERE token = ?").get("expired-device-token").c,
    ).toBe(0);

    const auditEntry = rawDb.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = ?").get("maintenance.cleanup");
    expect(auditEntry.c).toBe(1);
  });

  test("non-admin requests are forbidden", async () => {
    const { env, headers } = createTestEnv({ role: "viewer" });
    const request = new Request("https://example.test/api/admin/maintenance/cleanup-sessions", {
      method: "POST",
      headers,
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(403);
  });
});
