import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils";
import * as signupHandler from "../signup.js";
import { toSqliteDateTime } from "../../../../utils/authAttempts.js";

// Production writes invite_codes.expires_at via toSqliteDateTime() (space
// separator, no 'T') and compares it with `expires_at > datetime('now')`
// (signup.js). A fixture seeded with a raw .toISOString() ('T'-separated)
// value no longer resembles that write path and can mask the exact SEC-F1
// string-comparison bug class this helper exists to prevent (#687).
function daysFromNow(days) {
  return toSqliteDateTime(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

// An expiry at or before the current SQLite second that stays on the SAME
// UTC calendar day as "now". A full-day-ago (or earlier) expiry passes the
// "rejects an expired invite code" test even with a broken 'T'-separated
// fixture, because the DATE portion already diverges before the comparison
// ever reaches the 'T' (0x54) vs ' ' (0x20) byte — see #687. Forcing same-day
// makes the test exercise the actual time comparison instead of a lucky
// date-prefix mismatch. Capped well under 24h and halved from
// elapsed-since-midnight so the offset can never itself cross back over the
// UTC midnight boundary — including right at 00:00:00.000 UTC, where halving
// yields exactly 0 rather than forcing a negative (prior-day) offset.
// toSqliteDateTime() truncates to whole seconds, so an offset of 0 still
// yields an expiry the real datetime('now') comparison in signup.js treats
// as expired (not strictly greater) by the time the query actually runs.
function sameDayPastExpiry(maxOffsetMs = 3 * 60 * 60 * 1000) {
  const now = new Date();
  const msSinceMidnight = now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offsetMs = Math.min(maxOffsetMs, Math.floor(msSinceMidnight / 2));
  return toSqliteDateTime(new Date(now.getTime() - offsetMs));
}

describe("admin signup", () => {
  it("creates an inactive user and requires activation", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";

    // Create a valid invite code for the test
    const inviteCode = "TEST-INVITE-CODE-123";
    const expiresAt = daysFromNow(7);
    rawDb
      .prepare("INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)")
      .run(inviteCode, "editor", expiresAt, 1);

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
    const usedInvite = rawDb.prepare("SELECT * FROM invite_codes WHERE code = ?").get(inviteCode);
    expect(usedInvite.used_by_user_id).toBeDefined();
    expect(usedInvite.used_at).toBeDefined();

    const createdUser = rawDb
      .prepare(
        "SELECT email, is_active, activation_token, activation_token_expires_at, activated_at FROM users WHERE email = ?",
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
    const expiresAt = sameDayPastExpiry();
    rawDb
      .prepare("INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)")
      .run(expiredCode, "editor", expiresAt, 1);

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
    const futureDate = daysFromNow(7);
    // Insert existing user to reference as used_by_user_id
    rawDb
      .prepare("INSERT INTO users (email, password_hash, name, role, is_active) VALUES (?, ?, ?, ?, ?)")
      .run("existing@example.com", "hash", "Existing", "editor", 1);
    const existingUser = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("existing@example.com");
    rawDb
      .prepare("INSERT INTO invite_codes (code, role, expires_at, is_active, used_by_user_id) VALUES (?, ?, ?, ?, ?)")
      .run(usedCode, "editor", futureDate, 1, existingUser.id);

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

  it("stores activation_token_expires_at with a space separator, no ISO 'T' (SEC-F1 class, #670)", async () => {
    // CLAUDE.md "SQLite datetime format": D1's datetime('now') returns
    // `YYYY-MM-DD HH:MM:SS`. A stored value with a `T` (from a raw
    // .toISOString()) silently breaks `activation_token_expires_at >=
    // datetime('now')` in activate.js's SQL expiry guard — the exact SEC-F1
    // bug shape. Reading the column back off the real (better-sqlite3-backed)
    // test DB after signup.js's actual INSERT proves the write site itself
    // calls toSqliteDateTime() and binds its output — not just that the
    // helper produces the right format in isolation.
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";

    const inviteCode = "INVITE-SEC-F1-TEST";
    const expiresAt = daysFromNow(7);
    rawDb
      .prepare("INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)")
      .run(inviteCode, "editor", expiresAt, 1);

    const request = new Request("https://example.test/api/admin/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "secf1@example.com",
        password: "StrongPass1!",
        name: "SecF1 User",
        inviteCode,
      }),
    });

    const response = await signupHandler.onRequestPost({ request, env });
    expect(response.status).toBe(201);

    const createdUser = rawDb
      .prepare("SELECT activation_token_expires_at FROM users WHERE email = ?")
      .get("secf1@example.com");
    expect(createdUser.activation_token_expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(createdUser.activation_token_expires_at).not.toContain("T");
  });

  it("response does not expose raw email provider result (P2-S6)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.ALLOW_ADMIN_SIGNUP = "true";

    const inviteCode = "INVITE-S6-TEST";
    const expiresAt = daysFromNow(7);
    rawDb
      .prepare("INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES (?, ?, ?, ?)")
      .run(inviteCode, "editor", expiresAt, 1);

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
