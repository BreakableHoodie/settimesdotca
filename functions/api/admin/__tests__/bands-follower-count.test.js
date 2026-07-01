import { describe, expect, test, vi } from "vitest";

vi.mock("../_middleware.js", () => ({
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
    return { error: false, user: { userId: 1, role }, userId: 1 };
  },
  auditLog: vi.fn(async () => {}),
}));

import { onRequestGet } from "../bands.js";
import { createTestEnv } from "../../test-utils.js";

describe("GET /api/admin/bands — follower_count", () => {
  test("includes the verified follower count per band", async () => {
    const { env, rawDb } = createTestEnv();
    const profileId = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("The Reverbs", "thereverbs").lastInsertRowid;

    // 2 verified followers + 1 unverified (should not count)
    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("a@x.co", profileId, "tk-a");
    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("b@x.co", profileId, "tk-b");
    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 0, ?)")
      .run("c@x.co", profileId, "tk-c");

    const res = await onRequestGet({
      request: new Request("https://example.test/api/admin/bands", {
        headers: { "x-test-role": "viewer" },
      }),
      env,
      data: { user: { userId: 1, role: "viewer" } },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const band = (body.bands || []).find((b) => b.name === "The Reverbs");
    expect(band).toBeTruthy();
    expect(band.follower_count).toBe(2);
  });
});
