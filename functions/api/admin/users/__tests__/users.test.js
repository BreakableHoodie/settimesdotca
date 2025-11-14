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

  it("creates users and logs the action", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });

    const request = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        email: "new-user@test.com",
        password: "Secretpass1",
        role: "editor",
        name: "New User",
      }),
    });

    const response = await usersHandler.onRequestPost({ request, env });
    expect(response.status).toBe(201);

    const created = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("new-user@test.com");
    expect(created).toBeDefined();
    expect(created.password_hash).toBeTruthy();

    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'user.created'")
      .get();
    expect(audit).toBeDefined();
    expect(audit.resource_id).toBe(created.id);
  });

  it("prevents non-admins from creating users", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        email: "blocked@test.com",
        password: "Blocked123",
        role: "viewer",
        name: "Blocked",
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
    const { env, headers } = createTestEnv({ role: "admin" });

    const body = {
      email: "dup-user@test.com",
      password: "DupPass123",
      role: "editor",
      name: "Dup User",
    };

    const first = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const second = new Request("https://example.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const firstResponse = await usersHandler.onRequestPost({
      request: first,
      env,
    });
    expect(firstResponse.status).toBe(201);

    const secondResponse = await usersHandler.onRequestPost({
      request: second,
      env,
    });
    expect(secondResponse.status).toBe(409);
  });
});
