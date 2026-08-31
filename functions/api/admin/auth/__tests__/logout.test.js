// Tests for POST /api/admin/auth/logout.
//
// Covers the two documented "always clear the cookies" paths: the normal
// path (with or without a resolvable session — see the "Clear session
// cookie (even if no session found)" comment at the top of the handler's
// tail) and the catch-block fail-safe (the "Even if there's an error,
// clear the cookie" comment), which only a forced internal error can reach.

import { describe, expect, test } from "vitest";
import { onRequestPost } from "../logout.js";
import { createTestEnv } from "../../../test-utils.js";

const LOGOUT_URL = "https://example.test/api/admin/auth/logout";

function logoutRequest(headers = {}) {
  return new Request(LOGOUT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sessionCookieCleared(cookies) {
  return cookies.some((c) => c.startsWith("session_token=;") && c.includes("Max-Age=0"));
}

function csrfCookieCleared(cookies) {
  return cookies.some((c) => c.startsWith("csrf_token=;"));
}

describe("POST /api/admin/auth/logout", () => {
  test("an authenticated request deletes the session row and clears both cookies", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const sessionId = headers.Authorization.replace("Bearer ", "");

    const response = await onRequestPost({ request: logoutRequest(headers), env });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, message: "Logged out successfully" });

    const remaining = rawDb.prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE id = ?").get(sessionId);
    expect(remaining.c).toBe(0);

    const cookies = response.headers.getSetCookie();
    expect(sessionCookieCleared(cookies)).toBe(true);
    expect(csrfCookieCleared(cookies)).toBe(true);
  });

  test("no session credential at all still succeeds and still clears both cookies", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const response = await onRequestPost({ request: logoutRequest(), env });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, message: "Logged out successfully" });

    const cookies = response.headers.getSetCookie();
    expect(sessionCookieCleared(cookies)).toBe(true);
    expect(csrfCookieCleared(cookies)).toBe(true);
  });

  test("an internal error during logout is swallowed and still clears both cookies (fail-safe error path)", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });
    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("SELECT user_id FROM lucia_sessions")) {
        throw new Error("forced session lookup failure");
      }
      return originalPrepare(sql);
    };

    const response = await onRequestPost({ request: logoutRequest(headers), env });

    expect(response.status).toBe(200);
    const body = await response.json();
    // Deliberately the SHORTER message — distinguishes the catch-block reply
    // from the normal-path "Logged out successfully" above.
    expect(body).toEqual({ success: true, message: "Logged out" });

    const cookies = response.headers.getSetCookie();
    expect(sessionCookieCleared(cookies)).toBe(true);
    expect(csrfCookieCleared(cookies)).toBe(true);
  });
});
