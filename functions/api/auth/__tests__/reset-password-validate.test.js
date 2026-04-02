import { describe, expect, test } from "vitest";
import { createTestEnv, mockUsers } from "../../test-utils.js";
import { onRequestPost } from "../reset-password/validate.js";

const BASE_URL = "https://example.test/api/auth/reset-password/validate";

/**
 * Inserts a password_reset_token row and returns the token string.
 * `created_by` is required (NOT NULL FK) — use admin as the issuer.
 */
function insertToken(rawDb, { userId = mockUsers.editor.id, used = 0, expired = false, userInactive = false } = {}) {
  if (userInactive) {
    rawDb.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(userId);
  }

  const token = crypto.randomUUID();
  // Use -2 days (not -1 hour) for expired: SQLite datetime() returns UTC but
  // Node.js parses the space-separated string as local time, so a short offset
  // can appear in the future on UTC-negative machines.
  const expiresExpr = expired ? "datetime('now', '-2 days')" : "datetime('now', '+30 days')";
  rawDb
    .prepare(
      `INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, used)
       VALUES (?, ?, ?, ${expiresExpr}, ?)`,
    )
    .run(userId, token, mockUsers.admin.id, used);
  return token;
}

describe("POST /api/auth/reset-password/validate", () => {
  test("returns valid user info for a valid token", async () => {
    const { env, rawDb } = createTestEnv();
    const token = insertToken(rawDb, { userId: mockUsers.editor.id });

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      env,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.valid).toBe(true);
    expect(payload.user.email).toBe(mockUsers.editor.email);
    expect(payload).toHaveProperty("expiresAt");
  });

  test("returns 400 TOKEN_INVALID for unknown token", async () => {
    const { env } = createTestEnv();

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "no-such-token" }),
      }),
      env,
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("TOKEN_INVALID");
  });

  test("returns 400 TOKEN_INVALID for an already-used token", async () => {
    const { env, rawDb } = createTestEnv();
    const token = insertToken(rawDb, { used: 1 });

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      env,
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("TOKEN_INVALID");
  });

  test("returns 400 TOKEN_EXPIRED for an expired token", async () => {
    const { env, rawDb } = createTestEnv();
    const token = insertToken(rawDb, { expired: true });

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      env,
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("TOKEN_EXPIRED");
  });

  test("returns 400 USER_INACTIVE for a token belonging to an inactive user", async () => {
    const { env, rawDb } = createTestEnv();
    const token = insertToken(rawDb, { userInactive: true });

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      env,
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("USER_INACTIVE");
  });

  test("returns 400 for missing token field", async () => {
    const { env } = createTestEnv();

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    });

    expect(response.status).toBe(400);
  });

  test("returns 400 for invalid JSON body", async () => {
    const { env } = createTestEnv();

    const response = await onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{{",
      }),
      env,
    });

    expect(response.status).toBe(400);
  });
});
