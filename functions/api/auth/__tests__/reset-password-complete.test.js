// Tests for POST /api/auth/reset-password (completion handler in
// reset-password-complete.js, re-exported by reset-password.js).
//
// Covers: successful reset + full session invalidation, expired-token
// rejection (without burning the token), replay protection on an
// already-used token, the no-existence-oracle guarantee for an unknown
// token, weak-password rejection with no write, and the
// parseJsonObjectBody contract for a null/malformed body.

import { describe, expect, test, beforeAll } from "vitest";
import { createTestEnv, mockUsers } from "../../test-utils.js";
import { onRequestPost } from "../reset-password-complete.js";
import { hashPassword, verifyPassword } from "../../../utils/crypto.js";

const BASE_URL = "https://example.test/api/auth/reset-password";

// Non-secret unit-test fixtures (the "test" marker keeps secret scanners quiet).
const OLD_PASSWORD = "old-test-Password1!";
const NEW_PASSWORD = "new-test-Password9!";
const WEAK_PASSWORD = "short1!"; // below FIELD_LIMITS.password.min (12)

let oldPasswordHash;

// Compute once for the whole suite to avoid repeating 600k PBKDF2 rounds per test.
beforeAll(async () => {
  oldPasswordHash = await hashPassword(OLD_PASSWORD);
}, 30_000);

/**
 * Inserts a password_reset_token row and returns the token string.
 * `created_by` is required (NOT NULL FK) — use admin as the issuer, mirroring
 * reset-password-validate.test.js's insertToken helper for its sibling endpoint.
 */
function insertToken(rawDb, { userId = mockUsers.editor.id, used = 0, expired = false } = {}) {
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

function insertSession(rawDb, userId) {
  const id = crypto.randomUUID();
  rawDb
    .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, Math.floor(Date.now() / 1000) + 3600, "127.0.0.1", "test-agent");
  return id;
}

function postReset(env, body) {
  return onRequestPost({
    request: new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4", "User-Agent": "test-agent" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
  });
}

describe("POST /api/auth/reset-password (completion)", () => {
  test("valid unused unexpired token resets the password and clears every session for that user", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(oldPasswordHash, mockUsers.editor.id);
    const token = insertToken(rawDb);
    insertSession(rawDb, mockUsers.editor.id);
    insertSession(rawDb, mockUsers.editor.id);

    const response = await postReset(env, { token, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const user = rawDb.prepare("SELECT password_hash FROM users WHERE id = ?").get(mockUsers.editor.id);
    expect(await verifyPassword(NEW_PASSWORD, user.password_hash)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, user.password_hash)).toBe(false);

    const sessions = rawDb
      .prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE user_id = ?")
      .get(mockUsers.editor.id);
    expect(sessions.c).toBe(0);

    const tokenRow = rawDb.prepare("SELECT used FROM password_reset_tokens WHERE token = ?").get(token);
    expect(tokenRow.used).toBe(1);
  }, 15_000);

  test("an expired token is rejected and is NOT marked used (a rejected attempt must not burn it)", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(oldPasswordHash, mockUsers.editor.id);
    const token = insertToken(rawDb, { expired: true });

    const response = await postReset(env, { token, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("TOKEN_EXPIRED");

    const tokenRow = rawDb.prepare("SELECT used FROM password_reset_tokens WHERE token = ?").get(token);
    expect(tokenRow.used).toBe(0);

    const user = rawDb.prepare("SELECT password_hash FROM users WHERE id = ?").get(mockUsers.editor.id);
    expect(user.password_hash).toBe(oldPasswordHash);
  });

  test("an already-used token is rejected (replay protection)", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(oldPasswordHash, mockUsers.editor.id);
    const token = insertToken(rawDb, { used: 1 });

    const response = await postReset(env, { token, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("TOKEN_INVALID");
    expect(body.error).toBe("Invalid or expired reset token");

    const user = rawDb.prepare("SELECT password_hash FROM users WHERE id = ?").get(mockUsers.editor.id);
    expect(user.password_hash).toBe(oldPasswordHash);
  });

  test("an unknown token gets the identical response shape as an already-used token — no existence oracle", async () => {
    const { env, rawDb } = createTestEnv();
    const usedToken = insertToken(rawDb, { used: 1 });

    const usedResponse = await postReset(env, { token: usedToken, newPassword: NEW_PASSWORD });
    const unknownResponse = await postReset(env, { token: "never-issued-token", newPassword: NEW_PASSWORD });

    expect(usedResponse.status).toBe(unknownResponse.status);
    const usedBody = await usedResponse.json();
    const unknownBody = await unknownResponse.json();
    expect(usedBody.code).toBe(unknownBody.code);
    expect(usedBody.error).toBe(unknownBody.error);
    // Nothing in the body distinguishes "this token existed and was used" from
    // "this token never existed at all".
    expect(unknownBody).not.toHaveProperty("userId");
    expect(unknownBody).not.toHaveProperty("email");
  });

  test("a new password failing validatePassword is rejected with 400 and writes nothing", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(oldPasswordHash, mockUsers.editor.id);
    const token = insertToken(rawDb);

    const response = await postReset(env, { token, newPassword: WEAK_PASSWORD });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("PASSWORD_INVALID");

    const user = rawDb.prepare("SELECT password_hash FROM users WHERE id = ?").get(mockUsers.editor.id);
    expect(user.password_hash).toBe(oldPasswordHash);

    const tokenRow = rawDb.prepare("SELECT used FROM password_reset_tokens WHERE token = ?").get(token);
    expect(tokenRow.used).toBe(0);
  });

  test("a JSON null body returns 400 MISSING_FIELDS (parseJsonObjectBody contract)", async () => {
    const { env } = createTestEnv();
    const response = await postReset(env, "null");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("MISSING_FIELDS");
  });

  test("a malformed JSON body returns 400 MISSING_FIELDS (parseJsonObjectBody contract)", async () => {
    const { env } = createTestEnv();
    const response = await postReset(env, "not valid json{{");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("MISSING_FIELDS");
  });
});
