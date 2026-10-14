// #1253: admins and editors must enrol in 2FA before using the admin area;
// viewers may choose. Until enrolment every session-authenticated admin route
// except the enrolment set answers 403 MFA_SETUP_REQUIRED, on BOTH session
// paths (the middleware, and checkPermission's own enforceSession fallback).
import { describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import { checkPermission, onRequest } from "../_middleware.js";
import * as meHandler from "../me.js";

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
    expect((await response.json()).user).toMatchObject({ role: "admin", mfaRequired: true, mfaEnabled: false });
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
});
