import { describe, expect, test, vi } from "vitest";

import { onRequest, auditLog } from "../_middleware.js";
import { createTestEnv } from "../../test-utils.js";
import { logger } from "../../../utils/logger.js";

const BASE_URL = "https://example.test/api/admin/me";

describe("admin auth middleware", () => {
  test("reports remaining idle time instead of the full idle timeout", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const sessionId = headers.Authorization.replace("Bearer ", "");

    rawDb
      .prepare(
        `UPDATE lucia_sessions
         SET created_at = datetime('now', '-1 hour'),
             last_activity_at = datetime('now', '-14 minutes')
         WHERE id = ?`,
      )
      .run(sessionId);

    const response = await onRequest({
      request: new Request(BASE_URL, { headers }),
      env,
      data: {},
      next: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    expect(response.status).toBe(200);

    const idleRemaining = Number(response.headers.get("X-Session-Idle-Expires-In"));
    const timeRemaining = Number(response.headers.get("X-Session-Expires-In"));
    const absoluteRemaining = Number(response.headers.get("X-Session-Absolute-Expires-In"));

    expect(idleRemaining).toBeGreaterThan(0);
    expect(idleRemaining).toBeLessThan(120);
    expect(timeRemaining).toBe(idleRemaining);
    expect(absoluteRemaining).toBeGreaterThan(6 * 60 * 60);
    expect(response.headers.get("X-Session-Warning")).toBe("true");
  });
});

describe("auditLog (#671)", () => {
  test("logs via the module logger when the write fails and no caller-supplied logger is passed", async () => {
    const { env } = createTestEnv({ role: "admin" });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    try {
      // user_id 99999 doesn't exist, so the FK-constrained INSERT throws.
      await auditLog(env, 99999, "test.action", "test_resource", 1, null, "127.0.0.1");

      expect(warnSpy).toHaveBeenCalledWith(
        "Audit log write failed",
        expect.objectContaining({ action: "test.action", resourceType: "test_resource", resourceId: 1 }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("resolves even when the logger itself throws — the contract is unconditional", async () => {
    const { env } = createTestEnv({ role: "admin" });
    let warnCalled = false;
    const throwingLogger = {
      warn: () => {
        warnCalled = true;
        throw new Error("logger exploded");
      },
    };

    // user_id 99999 doesn't exist, so the FK-constrained INSERT throws, which
    // drives execution into the catch block and then into the logger.
    //
    // Every call site awaits auditLog with no .catch(), so a throw from the
    // catch block would 500 a request whose work already succeeded (an email
    // sent, a digest flushed) and invite a retry of it.
    await expect(
      auditLog(env, 99999, "test.action", "test_resource", 1, null, "127.0.0.1", throwingLogger),
    ).resolves.toBeUndefined();

    // Without this the test is vacuous: if the FK fixture ever stopped
    // throwing, auditLog would resolve WITHOUT entering the catch block and
    // this test would still pass, having exercised nothing.
    expect(warnCalled, "the logger failure path was never reached").toBe(true);
  });
});

describe("handler failures are not authentication failures", () => {
  test("a handler that throws after auth propagates; it is not logged or answered as an auth error", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const boom = new Error("handler exploded");

    try {
      await expect(
        onRequest({
          request: new Request(BASE_URL, { headers }),
          env,
          data: {},
          next: async () => {
            throw boom;
          },
        }),
      ).rejects.toBe(boom);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("behind the top-level middleware that throw is a JSON 500 that is not the auth-error body", async () => {
    const { onRequest: topLevel } = await import("../../../_middleware.js");
    const { env, headers } = createTestEnv({ role: "admin" });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await topLevel({
        request: new Request(BASE_URL, { headers }),
        env,
        data: {},
        next: () =>
          onRequest({
            request: new Request(BASE_URL, { headers }),
            env,
            data: {},
            next: async () => {
              throw new Error("handler exploded");
            },
          }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
      expect(JSON.stringify(body)).not.toMatch(/Authentication error|credentials/i);
      expect(errorSpy.mock.calls.map((c) => c[0])).not.toContain("Auth middleware error");
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

describe("session validation failures are logged (fail closed)", () => {
  test("a D1 error while validating the session is a 401 and is logged at error level without the session id", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const sessionId = headers.Authorization.replace("Bearer ", "");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB = {
      ...env.DB,
      prepare(sql) {
        if (sql.includes("lucia_sessions")) throw new Error("D1 unavailable");
        return realPrepare(sql);
      },
    };

    try {
      const response = await onRequest({
        request: new Request(BASE_URL, { headers }),
        env,
        data: {},
        next: async () => new Response("should not run"),
      });

      expect(response.status).toBe(401);
      const call = errorSpy.mock.calls.find((c) => /Session validation failed/.test(c[0]));
      expect(call, "the D1 failure is logged").toBeTruthy();
      expect(JSON.stringify(call)).not.toContain(sessionId);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
