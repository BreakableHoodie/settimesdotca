import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as resetHandler from "../[id]/reset-password.js";

describe("Admin user password reset API", () => {
  test("admin resets password successfully and logs action", async () => {
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
        body: JSON.stringify({ newPassword: "supersecurePASS123" }),
      }
    );
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(user.id);
    expect(updated.password_hash).not.toBe("oldhash");
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
        body: JSON.stringify({ newPassword: "supersecurePASS123" }),
      }
    );
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) },
    });
    expect(response.status).toBe(403);
  });

  test("rejects weak password", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name) VALUES (?, ?, ?)")
      .run("weak@test.com", "viewer", "Weak");
    const user = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("weak@test.com");
    const request = new Request(
      `https://example.test/api/admin/users/${user.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ newPassword: "short" }),
      }
    );
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) },
    });
    expect(response.status).toBe(400);
  });
});
