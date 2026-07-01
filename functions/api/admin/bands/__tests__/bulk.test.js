// Bulk band operations endpoint tests
// DELETE /api/admin/bands/bulk
import { describe, expect, test, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context) => {
    const role = context?.data?.user?.role || context?.request?.headers?.get("x-test-role");
    if (!role) {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { error: false, user: { userId: 1, email: "a@b.c", role }, userId: 1 };
  },
  auditLog: vi.fn(async () => {}),
}));

import { onRequestDelete } from "../bulk.js";
import { createTestEnv } from "../../../test-utils.js";

function deleteRequest(env, bandIds) {
  return onRequestDelete({
    request: new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "x-test-role": "editor", "content-type": "application/json" },
      body: JSON.stringify({ band_ids: bandIds }),
    }),
    env,
    data: { user: { userId: 1, email: "a@b.c", role: "editor" } },
  });
}

describe("DELETE /api/admin/bands/bulk", () => {
  test("reports success:false when some ids could not be deleted", async () => {
    const { env } = createTestEnv();
    const res = await deleteRequest(env, ["profile_abc"]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toBeTruthy();
    expect(body.deletedCount).toBe(0);
  });
});
