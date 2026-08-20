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
    const throwingLogger = {
      warn: () => {
        throw new Error("logger exploded");
      },
    };

    // user_id 99999 doesn't exist, so the FK-constrained INSERT throws, which
    // drives execution into the catch block and then into the logger.
    //
    // This matters because all 38 call sites await auditLog with no .catch().
    // A throw from the catch block would 500 a request whose work already
    // succeeded (an email sent, a digest flushed) and invite a retry of it.
    await expect(
      auditLog(env, 99999, "test.action", "test_resource", 1, null, "127.0.0.1", throwingLogger),
    ).resolves.toBeUndefined();
  });
});
