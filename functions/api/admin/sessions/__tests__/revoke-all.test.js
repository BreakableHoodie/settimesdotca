// Tests for POST /api/admin/sessions/revoke-all.
//
// The unauthenticated-via-API-key path (403 KEY_NOT_PERMITTED from the
// _middleware.js denylist) is already covered by
// functions/api/admin/__tests__/api-key-auth.test.js's SELF_SERVICE table —
// not duplicated here.

import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { onRequestPost } from "../revoke-all.js";
import { createTestEnv, mockUsers } from "../../../test-utils.js";
import { initializeLucia } from "../../../../utils/auth.js";

const REVOKE_ALL_URL = "https://example.test/api/admin/sessions/revoke-all";

// Reimplements csrf-csrf's own HMAC construction (see
// node_modules/csrf-csrf/dist/index.js: constructMessage/generateHmac) so the
// test can prove WHOSE session id the returned token is bound to, rather than
// merely that two random-nonce tokens differ (which would be true even if the
// handler forgot to pass the new session id at all).
function csrfHmac(secret, sessionId, randomValue) {
  const message = [String(sessionId.length), sessionId, String(randomValue.length), randomValue].join("!");
  return createHmac("sha256", secret).update(message).digest("hex");
}

function authedContext(env, request, user) {
  return {
    request,
    env,
    data: {
      user: { userId: user.id, role: user.role, email: user.email, name: null, isActive: true },
      lucia: initializeLucia(env.DB, request, env),
    },
  };
}

describe("POST /api/admin/sessions/revoke-all", () => {
  test("invalidates every prior session for the caller and mints exactly one new one", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "viewer" });
    const userId = mockUsers.viewer.id;
    const originalSessionId = headers.Authorization.replace("Bearer ", "");
    // A second "device" session for the same user.
    const secondSessionId = crypto.randomUUID();
    rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)")
      .run(secondSessionId, userId, Math.floor(Date.now() / 1000) + 3600, "9.9.9.9", "device-2");

    const request = new Request(REVOKE_ALL_URL, {
      method: "POST",
      headers: { "CF-Connecting-IP": "1.2.3.4", "User-Agent": "new-device" },
    });
    const response = await onRequestPost(authedContext(env, request, mockUsers.viewer));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const remaining = rawDb.prepare("SELECT * FROM lucia_sessions WHERE user_id = ?").all(userId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).not.toBe(originalSessionId);
    expect(remaining[0].id).not.toBe(secondSessionId);
    expect(remaining[0].ip_address).toBe("1.2.3.4");
    expect(remaining[0].user_agent).toBe("new-device");
  });

  test("issues a CSRF cookie bound to the NEW session id, not the old one", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "viewer" });
    const userId = mockUsers.viewer.id;
    const oldSessionId = headers.Authorization.replace("Bearer ", "");

    const request = new Request(REVOKE_ALL_URL, { method: "POST" });
    const response = await onRequestPost(authedContext(env, request, mockUsers.viewer));

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    const csrfCookie = cookies.find((c) => c.startsWith("csrf_token="));
    expect(csrfCookie).toBeTruthy();
    const token = csrfCookie.slice("csrf_token=".length).split(";")[0];
    const [hmac, randomValue] = token.split(".");
    expect(hmac).toBeTruthy();
    expect(randomValue).toBeTruthy();

    const newSession = rawDb.prepare("SELECT id FROM lucia_sessions WHERE user_id = ?").get(userId);
    expect(newSession.id).not.toBe(oldSessionId);

    const secret = env.CSRF_SECRET;
    expect(csrfHmac(secret, newSession.id, randomValue)).toBe(hmac);
    expect(csrfHmac(secret, oldSessionId, randomValue)).not.toBe(hmac);
  });

  test("no session credential at all is refused with 401", async () => {
    const { env } = createTestEnv({ role: "viewer" });
    const request = new Request(REVOKE_ALL_URL, { method: "POST" });

    const response = await onRequestPost({ request, env, data: {} });

    expect(response.status).toBe(401);
  });
});
