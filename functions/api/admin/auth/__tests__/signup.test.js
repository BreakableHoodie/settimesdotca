import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils";
import * as signupHandler from "../signup.js";

describe("admin signup", () => {
  it("creates a session for the new user", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const request = new Request("https://example.test/api/admin/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new.user@example.com",
        password: "strongpass",
        name: "New User",
      }),
    });

    const response = await signupHandler.onRequestPost({ request, env });
    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload.sessionToken).toBeTypeOf("string");

    const session = rawDb
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(payload.sessionToken);
    expect(session).toBeDefined();
    expect(session.user_id).toBeTypeOf("number");
  });
});
