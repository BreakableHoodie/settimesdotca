import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as resetHandler from "../[id]/reset-password.js";

describe("Admin user password reset API", () => {
  test("admin generates reset token and logs action", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare(
        "INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, ?)"
      )
      .run("resetme@test.com", "viewer", "Reset Me", "oldhash");
    const user = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("resetme@test.com");
    const request = new Request(
      `https://example.test/api/admin/users/${user.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ reason: "User forgot password" }),
      }
    );
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) }, data: { user: { userId: 1, role: "admin", email: "admin@test" } },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.resetUrl).toContain("reset-password?token=");
    const resetToken = rawDb
      .prepare(
        "SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC"
      )
      .get(user.id);
    expect(resetToken).toBeTruthy();
    const audit = rawDb
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'user.password_reset' AND resource_id = ?"
      )
      .get(user.id);
    expect(audit).toBeTruthy();
  });

  test("non-admin cannot reset password", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    rawDb
      .prepare("INSERT INTO users (email, role, name) VALUES (?, ?, ?)")
      .run("noreset@test.com", "viewer", "No Reset");
    const user = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("noreset@test.com");
    const request = new Request(
      `https://example.test/api/admin/users/${user.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ reason: "Not authorized" }),
      }
    );
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) }, data: { user: { userId: 2, role: "editor", email: "editor@test" } },
    });
    expect(response.status).toBe(403);
  });

  test("rejects reset for inactive user", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare(
        "INSERT INTO users (email, role, name, is_active) VALUES (?, ?, ?, ?)"
      )
      .run("inactive@test.com", "viewer", "Inactive", 0);
    const user = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("inactive@test.com");
    const request = new Request(
      `https://example.test/api/admin/users/${user.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ reason: "Account inactive" }),
      }
    );
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) }, data: { user: { userId: 1, role: "admin", email: "admin@test" } },
    });
    expect(response.status).toBe(400);
  });
});
