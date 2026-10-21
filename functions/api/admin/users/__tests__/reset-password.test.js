import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { createTestEnv, grantStepUp } from "../../../test-utils.js";
import * as resetHandler from "../[id]/reset-password.js";
import { hashResetToken } from "../../../../utils/tokens.js";

// Shared by the #1353/#1354 cases: a reset of a fresh viewer, with or without
// an email provider, returning what the database and the provider saw.
async function resetFreshUser({ emailConfigured = true, delivered = true } = {}) {
  const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
  grantStepUp(rawDb, sessionId);
  if (emailConfigured) {
    env.EMAIL_PROVIDER = "mailchannels";
    env.EMAIL_FROM = "no-reply@settimes.ca";
  }
  const sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return delivered ? { ok: true, text: async () => "" } : { ok: false, status: 500, text: async () => "down" };
    }),
  );
  rawDb
    .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, ?)")
    .run("resetme@test.com", "viewer", "Reset Me", "oldhash");
  const user = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("resetme@test.com");
  rawDb
    .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES ('target-session', ?, ?)")
    .run(user.id, Math.floor(Date.now() / 1000) + 3600);
  const response = await resetHandler.onRequestPost({
    request: new Request(`https://example.test/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ reason: "test" }),
    }),
    env,
    params: { id: String(user.id) },
    data: { user: { userId: 1, role: "admin", email: "admin@test" }, session: { id: sessionId, user_id: 1 } },
  });
  const tokens = rawDb.prepare("SELECT token, used FROM password_reset_tokens WHERE user_id = ?").all(user.id);
  const sessions = rawDb.prepare("SELECT id FROM lucia_sessions WHERE user_id = ?").all(user.id);
  return { response, tokens, sessions, sent, rawDb, userId: user.id };
}

describe("reset tokens are stored hashed (#1354)", () => {
  test("the database holds the hash of the token in the emailed link, never the token", async () => {
    const { response, tokens, sent } = await resetFreshUser();
    expect(response.status).toBe(200);
    const text = sent[0].content.find((c) => c.type === "text/plain").value;
    const plaintext = text.match(/reset-password#token=([\w-]+)/)[1];
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe(await hashResetToken(plaintext));
    expect(tokens[0].token).not.toContain(plaintext);
  });
});

describe("no side effects before the email can be sent (#1353)", () => {
  test("email not configured: 500, and no token is minted and nobody is signed out", async () => {
    const { response, tokens, sessions, sent } = await resetFreshUser({ emailConfigured: false });
    expect(response.status).toBe(500);
    expect(tokens).toEqual([]);
    expect(sessions).toEqual([{ id: "target-session" }]);
    expect(sent).toEqual([]);
  });

  test("delivery failed: 502, and the undelivered token is withdrawn", async () => {
    const { response, tokens, sessions } = await resetFreshUser({ delivered: false });
    expect(response.status).toBe(502);
    expect(tokens).toEqual([]);
    // Signing the user out does NOT depend on the provider, on purpose: an
    // admin forcing a reset may be answering a compromise.
    expect(sessions).toEqual([]);
  });

  test("delivery failed: the sign-out that did happen is audited, not just logged", async () => {
    const { response, rawDb, userId } = await resetFreshUser({ delivered: false });
    expect(response.status).toBe(502);
    const audit = rawDb
      .prepare("SELECT details FROM audit_log WHERE action = 'user.password_reset' AND resource_id = ?")
      .get(userId);
    expect(JSON.parse(audit.details)).toMatchObject({ emailDelivered: false, tokenWithdrawn: true });
  });
});

describe("Admin user password reset API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "",
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("admin generates reset token and logs action", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    env.EMAIL_PROVIDER = "mailchannels";
    env.EMAIL_FROM = "no-reply@settimes.ca";
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, ?)")
      .run("resetme@test.com", "viewer", "Reset Me", "oldhash");
    const user = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("resetme@test.com");
    const request = new Request(`https://example.test/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ reason: "User forgot password" }),
    });
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) },
      data: { user: { userId: 1, role: "admin", email: "admin@test" }, session: { id: sessionId, user_id: 1 } },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.message).toContain("Password reset email sent");
    const resetToken = rawDb
      .prepare("SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC")
      .get(user.id);
    expect(resetToken).toBeTruthy();
    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'user.password_reset' AND resource_id = ?")
      .get(user.id);
    expect(audit).toBeTruthy();
    const details = JSON.parse(audit.details);
    expect(details).toMatchObject({
      reason: "User forgot password",
      resetTokenGenerated: true,
    });
    expect(details).not.toHaveProperty("adminEmail");
    expect(details).not.toHaveProperty("targetEmail");
  });

  test("non-admin cannot reset password", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("noreset@test.com", "viewer", "No Reset");
    const user = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("noreset@test.com");
    const request = new Request(`https://example.test/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ reason: "Not authorized" }),
    });
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) },
      data: { user: { userId: 2, role: "editor", email: "editor@test" } },
    });
    expect(response.status).toBe(403);
  });

  test("rejects non-integer user id with 400", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    const request = new Request(`https://example.test/api/admin/users/1;DROP TABLE users/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({}),
    });
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: "1;DROP TABLE users" },
      data: { user: { userId: 1, role: "admin", email: "admin@test" }, session: { id: sessionId, user_id: 1 } },
    });
    expect(response.status).toBe(400);
  });

  test("rejects reset for inactive user", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    rawDb
      .prepare("INSERT INTO users (email, role, name, is_active, password_hash) VALUES (?, ?, ?, ?, 'placeholder')")
      .run("inactive@test.com", "viewer", "Inactive", 0);
    const user = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("inactive@test.com");
    const request = new Request(`https://example.test/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ reason: "Account inactive" }),
    });
    const response = await resetHandler.onRequestPost({
      request,
      env,
      params: { id: String(user.id) },
      data: { user: { userId: 1, role: "admin", email: "admin@test" }, session: { id: sessionId, user_id: 1 } },
    });
    expect(response.status).toBe(400);
  });
});
