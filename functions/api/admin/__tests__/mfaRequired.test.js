// #1253: admins and editors must enrol in 2FA before using the admin area;
// viewers may choose. Until enrolment every session-authenticated admin route
// except the enrolment set answers 403 MFA_SETUP_REQUIRED, on BOTH session
// paths (the middleware, and checkPermission's own enforceSession fallback).
import { describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import { checkPermission, onRequest } from "../_middleware.js";
import * as meHandler from "../me.js";
import * as mfaSetupHandler from "../mfa/setup.js";
import * as mfaEnableHandler from "../mfa/enable.js";
import { generateTotpCode } from "../../../utils/totp.js";

function sessionRequest(headers, path) {
  return new Request(`https://example.test${path}`, { method: "GET", headers });
}

async function throughMiddleware({ role, mfaEnrolled }, path, nextImpl) {
  const { env, headers } = createTestEnv({ role, mfaEnrolled });
  const next = vi.fn(nextImpl ?? (async () => new Response("ok", { status: 200 })));
  const context = { request: sessionRequest(headers, path), env, data: {}, params: {} };
  context.next = () => next(context);
  const response = await onRequest(context);
  return { response, next };
}

describe("2FA is required for admins and editors (#1253)", () => {
  it.each(["admin", "editor"])("an unenrolled %s is refused an ordinary admin route", async (role) => {
    const { response, next } = await throughMiddleware({ role, mfaEnrolled: false }, "/api/admin/events");
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("MFA_SETUP_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("a case or trailing-slash variant of a gated route is still refused", async () => {
    for (const path of ["/api/admin/Events", "/api/admin/events/"]) {
      const { response, next } = await throughMiddleware({ role: "editor", mfaEnrolled: false }, path);
      expect(response.status, path).toBe(403);
      expect(next, path).not.toHaveBeenCalled();
    }
  });

  // The allow direction is where routePath() matters: the enrolment set is an
  // allowlist, so a raw-pathname comparison would refuse these variants.
  it.each(["/api/admin/ME", "/api/admin/mfa/setup/", "/api/admin/MFA/Enable"])(
    "a case or trailing-slash variant of an enrolment route is still reachable: %s",
    async (path) => {
      const { response, next } = await throughMiddleware({ role: "editor", mfaEnrolled: false }, path);
      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["/api/admin/mfa/backup-codes", "/api/admin/mfa/disable", "/api/admin/me/x", "/api/admin//me"])(
    "a route next to the enrolment set is still refused: %s",
    async (path) => {
      const { response, next } = await throughMiddleware({ role: "editor", mfaEnrolled: false }, path);
      expect(response.status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it.each(["/api/admin/me", "/api/admin/mfa/status", "/api/admin/mfa/setup", "/api/admin/mfa/enable"])(
    "an unenrolled editor can still reach %s to enrol",
    async (path) => {
      const { response, next } = await throughMiddleware({ role: "editor", mfaEnrolled: false }, path);
      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it("/api/admin/me tells the client that enrolment is required", async () => {
    const { response } = await throughMiddleware({ role: "admin", mfaEnrolled: false }, "/api/admin/me", (ctx) =>
      meHandler.onRequestGet(ctx),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({
      role: "admin",
      mfaEnrolmentRequired: true,
      mfaEnabled: false,
    });
  });

  it.each(["admin", "editor"])("an enrolled %s passes", async (role) => {
    const { response, next } = await throughMiddleware({ role, mfaEnrolled: true }, "/api/admin/events");
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("a viewer without 2FA passes: it stays optional below editor", async () => {
    const { response, next } = await throughMiddleware({ role: "viewer", mfaEnrolled: false }, "/api/admin/events");
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("checkPermission's own session fallback enforces the same rule", async () => {
    const { env, headers } = createTestEnv({ role: "editor", mfaEnrolled: false });
    const gated = await checkPermission(
      { request: sessionRequest(headers, "/api/admin/events"), env, data: {} },
      "viewer",
    );
    expect(gated.error).toBe(true);
    expect((await gated.response.json()).code).toBe("MFA_SETUP_REQUIRED");

    const enrolment = await checkPermission(
      { request: sessionRequest(headers, "/api/admin/mfa/status"), env, data: {} },
      "viewer",
    );
    expect(enrolment.error).toBe(false);
  });

  it("enrolling revokes every session opened with the password alone (#1253 review)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor", mfaEnrolled: false });
    // Session A: say, an attacker's, opened with a phished password.
    const attackerSessionId = crypto.randomUUID();
    rawDb
      .prepare(
        "INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, 2, ?, '6.6.6.6', 'x')",
      )
      .run(attackerSessionId, Math.floor(Date.now() / 1000) + 3600);
    const attackerHeaders = { ...headers, Authorization: `Bearer ${attackerSessionId}` };

    // The real editor enrols through their own session.
    const jsonHeaders = { ...headers, "Content-Type": "application/json" };
    const setupRes = await mfaSetupHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/mfa/setup", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      }),
      env,
      data: {},
    });
    const { secret } = await setupRes.json();
    const enableRes = await mfaEnableHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/mfa/enable", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ code: await generateTotpCode(secret) }),
      }),
      env,
      data: {},
    });
    expect(enableRes.status).toBe(200);
    expect(enableRes.headers.getSetCookie().some((cookie) => cookie.includes("session"))).toBe(true);

    const context = { request: sessionRequest(attackerHeaders, "/api/admin/events"), env, data: {}, params: {} };
    const next = vi.fn(async () => new Response("ok", { status: 200 }));
    context.next = () => next(context);
    const attackerResponse = await onRequest(context);
    expect(attackerResponse.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 2").get().n).toBe(1);
  });
});
