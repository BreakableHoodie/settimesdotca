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
});
