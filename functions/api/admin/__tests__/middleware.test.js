import { describe, expect, test } from "vitest";

import { onRequest } from "../_middleware.js";
import { createTestEnv } from "../../test-utils.js";

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
