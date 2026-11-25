import { describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import * as resendActivationHandler from "../resend-activation.js";

const BASE_URL = "https://example.test/api/auth/resend-activation";

function insertInactiveUser(rawDb, { email = "inactive@example.com" } = {}) {
  rawDb
    .prepare(
      "INSERT INTO users (email, password_hash, name, role, is_active, activated_at) VALUES (?, ?, ?, ?, 0, NULL)",
    )
    .run(email, "hash", "Inactive User", "editor");
  return rawDb.prepare("SELECT id FROM users WHERE email = ?").get(email);
}

describe("POST /api/auth/resend-activation", () => {
  it("issues a new activation token and returns the generic success response", async () => {
    const { env, rawDb } = createTestEnv();
    const email = "resend@example.com";
    insertInactiveUser(rawDb, { email });

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const response = await resendActivationHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);

    const user = rawDb
      .prepare("SELECT activation_token, activation_token_expires_at FROM users WHERE email = ?")
      .get(email);
    expect(user.activation_token).toBeTruthy();
    expect(user.activation_token_expires_at).toBeTruthy();
  });

  it("finds a lowercased account when the request uses mixed case", async () => {
    const { env, rawDb } = createTestEnv();
    insertInactiveUser(rawDb, { email: "mixed@example.com" });

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "  Mixed@Example.COM " }),
    });

    const response = await resendActivationHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const user = rawDb.prepare("SELECT activation_token FROM users WHERE email = ?").get("mixed@example.com");
    expect(user.activation_token).toBeTruthy();
  });

  it("stores activation_token_expires_at with a space separator, no ISO 'T' (SEC-F1 class, #670)", async () => {
    // Same invariant as signup.js's write site (CLAUDE.md "SQLite datetime
    // format"): a stored `T` silently breaks the `activation_token_expires_at
    // >= datetime('now')` SQL guard in activate.js. Reading the column back
    // off the real (better-sqlite3-backed) test DB after resend-activation.js's
    // actual UPDATE proves the write site calls toSqliteDateTime() and binds
    // its output — not just that the helper produces the right format in
    // isolation.
    const { env, rawDb } = createTestEnv();
    const email = "secf1-resend@example.com";
    insertInactiveUser(rawDb, { email });

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const response = await resendActivationHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const user = rawDb.prepare("SELECT activation_token_expires_at FROM users WHERE email = ?").get(email);
    expect(user.activation_token_expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(user.activation_token_expires_at).not.toContain("T");
  });

  it("returns the generic response without minting a token for an already-active user", async () => {
    const { env, rawDb } = createTestEnv();
    const email = "already-active@example.com";
    rawDb
      .prepare(
        "INSERT INTO users (email, password_hash, name, role, is_active, activated_at) VALUES (?, ?, ?, ?, 1, datetime('now'))",
      )
      .run(email, "hash", "Active User", "editor");

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const response = await resendActivationHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);

    const user = rawDb.prepare("SELECT activation_token FROM users WHERE email = ?").get(email);
    expect(user.activation_token).toBeNull();
  });

  it("sends no email and rotates no token for an invitee an admin deactivated", async () => {
    const { env, rawDb } = createTestEnv();
    const email = "deactivated-invitee@example.com";
    const { id } = insertInactiveUser(rawDb, { email });
    rawDb
      .prepare("UPDATE users SET activation_token = 'old-digest', deactivated_at = datetime('now') WHERE id = ?")
      .run(id);
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    Object.assign(env, { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", EMAIL_FROM: "noreply@example.test" });

    const response = await resendActivationHandler.onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
      env,
    });
    vi.unstubAllGlobals();

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    // The early refusal also leaves the per-recipient cap unspent (it runs before the cap).
    expect(rawDb.prepare("SELECT COUNT(*) AS c FROM rate_limits WHERE key LIKE 'email-recipient:%'").get().c).toBe(0);
    expect(rawDb.prepare("SELECT activation_token FROM users WHERE id = ?").get(id).activation_token).toBe(
      "old-digest",
    );
  });

  it("returns the generic response for an unknown email (user-enumeration resistance)", async () => {
    const { env } = createTestEnv();

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com" }),
    });

    const response = await resendActivationHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
  });
});

describe("POST /api/auth/resend-activation — the token write is pinned to the state it read", () => {
  it("sends no email and stores no token when the row is deactivated between the read and the write", async () => {
    const { env, rawDb } = createTestEnv();
    const email = "race-invitee@example.com";
    const { id } = insertInactiveUser(rawDb, { email });
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    Object.assign(env, { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", EMAIL_FROM: "noreply@example.test" });
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      // The admin's deactivate lands after the SELECT and before the UPDATE runs.
      if (/^\s*UPDATE users/.test(sql)) {
        rawDb.prepare("UPDATE users SET deactivated_at = datetime('now') WHERE id = ?").run(id);
      }
      return realPrepare(sql);
    };

    const response = await resendActivationHandler.onRequestPost({
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
      env,
    });
    vi.unstubAllGlobals();

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rawDb.prepare("SELECT activation_token FROM users WHERE id = ?").get(id).activation_token).toBeNull();
  });
});
