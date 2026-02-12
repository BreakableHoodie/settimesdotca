import { describe, expect, test } from "vitest";
import { onRequestGet } from "../me.js";

describe("GET /api/admin/me", () => {
  test("returns authenticated user and safe session metadata", async () => {
    const request = new Request("https://example.test/api/admin/me");
    const user = { id: 1, email: "admin@test", role: "admin" };
    const session = {
      id: "session-token",
      session_token: "session-token",
      user_id: 1,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    const response = await onRequestGet({
      request,
      data: { user, session },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.authenticated).toBe(true);
    expect(payload.user).toMatchObject(user);
    expect(payload.session).toMatchObject({
      expires_at: session.expires_at,
    });
    expect(payload.session).not.toHaveProperty("id");
    expect(payload.session).not.toHaveProperty("session_token");
    expect(payload.session).not.toHaveProperty("user_id");
  });
});
