import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils";
import * as usersHandler from "../../users.js";

describe("Admin users API", () => {
  it("allows admins to list users", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const request = new Request("https://example.test/api/admin/users", {
      headers,
    });

    const response = await usersHandler.onRequestGet({ request, env });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.some((user) => user.email === "admin@test")).toBe(true);
    expect(body.users.every((user) => typeof user.isActive === "boolean")).toBe(
      true
    );
  });

  it("rejects non-admin list requests", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/users", {
      headers,
    });

    const response = await usersHandler.onRequestGet({ request, env });
    expect(response.status).toBe(403);
  });

  it("invites users and logs the action", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });

    const request = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        email: "new-user@test.com",
        role: "editor",
        firstName: "New",
        lastName: "User",
      }),
    });

    const response = await usersHandler.onRequestPost({ request, env });
    expect(response.status).toBe(201);

    const invite = rawDb
      .prepare("SELECT * FROM invite_codes WHERE email = ?")
      .get("new-user@test.com");
    expect(invite).toBeDefined();
    expect(invite.role).toBe("editor");

    const created = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("new-user@test.com");
    expect(created).toBeUndefined();

    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'user.invited'")
      .get();
    expect(audit).toBeDefined();
    expect(audit.resource_id).toBe(invite.id);
  });

  it("prevents non-admins from creating users", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        email: "blocked@test.com",
        role: "viewer",
        firstName: "Blocked",
        lastName: "User",
      }),
    });

    const response = await usersHandler.onRequestPost({ request, env });
    expect(response.status).toBe(403);

    const exists = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("blocked@test.com");
    expect(exists).toBeUndefined();
  });

  it("rejects duplicate user emails", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });

    rawDb
      .prepare("INSERT INTO users (email, role) VALUES (?, ?)")
      .run("dup-user@test.com", "viewer");

    const body = {
      email: "dup-user@test.com",
      role: "editor",
      firstName: "Dup",
      lastName: "User",
    };

    const request = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const response = await usersHandler.onRequestPost({
      request,
      env,
    });
    expect(response.status).toBe(409);
  });
});
