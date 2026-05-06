import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils";
import * as signupHandler from "../signup.js";

describe("admin signup", () => {
  it("creates an inactive user and requires activation", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";
    
    // Create a valid invite code for the test
    const inviteCode = "TEST-INVITE-CODE-123";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    rawDb.prepare(
      "INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)"
    ).run(inviteCode, "editor", expiresAt, 1);
    
    const request = new Request("https://example.test/api/admin/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new.user@example.com",
        password: "StrongPass1!",
        name: "New User",
        inviteCode: inviteCode,
      }),
    });

    const response = await signupHandler.onRequestPost({ request, env });
    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.requiresActivation).toBe(true);
    expect(payload.user).toBeUndefined();
    
    // Verify the invite code was marked as used
    const usedInvite = rawDb
      .prepare("SELECT * FROM invite_codes WHERE code = ?")
      .get(inviteCode);
    expect(usedInvite.used_by_user_id).toBeDefined();
    expect(usedInvite.used_at).toBeDefined();

    const createdUser = rawDb
      .prepare(
        "SELECT email, is_active, activation_token, activation_token_expires_at, activated_at FROM users WHERE email = ?"
      )
      .get("new.user@example.com");
    expect(createdUser).toBeDefined();
    expect(createdUser.is_active).toBe(0);
    expect(createdUser.activation_token).toBeTruthy();
    expect(createdUser.activation_token_expires_at).toBeTruthy();
    expect(createdUser.activated_at).toBeNull();
  });

  it("rejects an expired invite code (T4)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";

    const expiredCode = "EXPIRED-CODE-123";
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    rawDb.prepare(
      "INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)"
    ).run(expiredCode, "editor", yesterday, 1);

    const request = new Request("https://example.test/api/admin/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "expired@example.com",
        password: "StrongPass1!",
        name: "Expired User",
        inviteCode: expiredCode,
      }),
    });

    const response = await signupHandler.onRequestPost({ request, env });
    // signup handler returns 400 or 403 for invalid invite codes
    expect([400, 403]).toContain(response.status);
  });

  it("rejects a used invite code (T4)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";

    const usedCode = "USED-CODE-456";
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // Insert existing user to reference as used_by_user_id
    rawDb.prepare("INSERT INTO users (email, password_hash, name, role, is_active) VALUES (?, ?, ?, ?, ?)").run(
      "existing@example.com", "hash", "Existing", "editor", 1
    );
    const existingUser = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("existing@example.com");
    rawDb.prepare(
      "INSERT INTO invite_codes (code, role, expires_at, is_active, used_by_user_id) VALUES (?, ?, ?, ?, ?)"
    ).run(usedCode, "editor", futureDate, 1, existingUser.id);

    const request = new Request("https://example.test/api/admin/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "newuser@example.com",
        password: "StrongPass1!",
        name: "New User",
        inviteCode: usedCode,
      }),
    });

    const response = await signupHandler.onRequestPost({ request, env });
    expect([400, 403]).toContain(response.status);
  });

  it("response does not expose raw email provider result (P2-S6)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";

    const inviteCode = "INVITE-S6-TEST";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    rawDb.prepare(
      "INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)"
    ).run(inviteCode, "editor", expiresAt, 1);

    const request = new Request("https://example.test/api/admin/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "leaky@example.com",
        password: "StrongPass1!",
        name: "Leaky User",
        inviteCode,
      }),
    });

    const response = await signupHandler.onRequestPost({ request, env });
    expect(response.status).toBe(201);

    const payload = await response.json();
    // email field must be a safe boolean-only shape
    expect(payload.email).toEqual({ delivered: expect.any(Boolean) });
    // must not contain provider internals
    const emailKeys = Object.keys(payload.email);
    expect(emailKeys).toEqual(["delivered"]);
  });
});
