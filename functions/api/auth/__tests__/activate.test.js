import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import * as activateHandler from "../activate.js";
import { toSqliteDateTime } from "../../../utils/authAttempts.js";

const BASE_URL = "https://example.test/api/auth/activate";

function insertPendingUser(rawDb, { email = "pending@example.com", token = "tok-123", expiresAt } = {}) {
  rawDb
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activation_token_expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(email, "hash", "Pending User", "editor", token, expiresAt);
  return rawDb.prepare("SELECT id FROM users WHERE email = ?").get(email);
}

function activateRequest(token) {
  return new Request(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

describe("POST /api/auth/activate", () => {
  it("activates a pending user with a valid, non-expired (SQLite-format) token", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = toSqliteDateTime(new Date(Date.now() + 60 * 60 * 1000)); // 1h from now
    insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(200);
    const user = rawDb
      .prepare("SELECT is_active, activated_at, activation_token FROM users WHERE email = ?")
      .get("pending@example.com");
    expect(user.is_active).toBe(1);
    expect(user.activated_at).toBeTruthy();
    expect(user.activation_token).toBeNull();
  });

  it("rejects a token whose activation_token_expires_at (SQLite format) is in the past — TZ-parsing regression guard", async () => {
    // This is the exact bug the SEC-F1 write-side fix (#670) introduced and
    // fromSqliteDateTime() (authAttempts.js) fixes: activation_token_expires_at
    // no longer carries a 'Z' suffix once written via toSqliteDateTime(), so a
    // bare `new Date(value)` falls back to LOCAL-time parsing instead of UTC.
    // On a UTC-negative host that silently shifts the parsed instant LATER,
    // which could let an already-expired token still validate. Using an
    // expiry only 1 HOUR in the past (not e.g. 2 days) makes this sensitive
    // to exactly that class of drift, not just a gross date-prefix mismatch.
    const { env, rawDb } = createTestEnv();
    const expiresAt = toSqliteDateTime(new Date(Date.now() - 60 * 60 * 1000)); // 1h ago
    insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Activation link expired");

    const user = rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com");
    expect(user.is_active).toBe(0);
  });

  it("still activates a valid, non-expired LEGACY ISO ('T'+'Z') token (backward compat, no migration needed)", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(200);
  });

  it("still rejects an expired LEGACY ISO ('T'+'Z') token (backward compat)", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(400);
  });

  it("rejects an unknown token", async () => {
    const { env } = createTestEnv();

    const response = await activateHandler.onRequestPost({ request: activateRequest("no-such-token"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Invalid or expired token");
  });

  it("rejects an already-activated account", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb
      .prepare(
        `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activated_at)
         VALUES (?, ?, ?, ?, 1, ?, datetime('now'))`,
      )
      .run("already@example.com", "hash", "Already Active", "editor", "tok-already");

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-already"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Already activated");
  });
});
