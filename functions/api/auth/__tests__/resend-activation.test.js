import { describe, expect, it } from "vitest";
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
