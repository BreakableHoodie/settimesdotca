import { describe, expect, test } from "vitest";
import { onRequestGet } from "../me.js";

describe("GET /api/admin/me", () => {
  test("returns authenticated user and session details", async () => {
    const request = new Request("https://example.test/api/admin/me");
    const user = { id: 1, email: "admin@test", role: "admin" };
    const session = {
      id: 10,
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
      id: session.id,
      session_token: session.session_token,
      user_id: session.user_id,
    });
  });
});
