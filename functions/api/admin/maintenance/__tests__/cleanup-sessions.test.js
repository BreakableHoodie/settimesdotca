import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import { onRequestPost } from "../cleanup-sessions.js";

describe("POST /api/admin/maintenance/cleanup-sessions", () => {
  test("admin can delete expired sessions and logs audit", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    const activeAt = Math.floor(Date.now() / 1000) + 60 * 60;

    rawDb
      .prepare(
        "INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
      )
      .run("expired-token", 1, expiredAt, "127.0.0.1", "test-agent");

    rawDb
      .prepare(
        "INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
      )
      .run("active-token", 1, activeAt, "127.0.0.1", "test-agent");

    const request = new Request(
      "https://example.test/api/admin/maintenance/cleanup-sessions",
      { method: "POST", headers },
    );

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.deleted_count).toBe(1);

    const expiredRow = rawDb
      .prepare("SELECT COUNT(*) as count FROM lucia_sessions WHERE id = ?")
      .get("expired-token");
    const activeRow = rawDb
      .prepare("SELECT COUNT(*) as count FROM lucia_sessions WHERE id = ?")
      .get("active-token");

    expect(expiredRow.count).toBe(0);
    expect(activeRow.count).toBe(1);

    const audit = rawDb
      .prepare("SELECT COUNT(*) as count FROM audit_log WHERE action = ?")
      .get("sessions.cleanup");
    expect(audit.count).toBe(1);
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
