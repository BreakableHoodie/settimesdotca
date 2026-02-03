import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as userItemHandler from "../[id].js";

describe("Admin user item API", () => {
  test("admin updates user role and name with audit log", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    // Insert a viewer user to update
    rawDb
      .prepare("INSERT INTO users (email, role, name) VALUES (?, ?, ?)")
      .run("viewer2@test.com", "viewer", "View Two");
    const toUpdate = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("viewer2@test.com");

    const request = new Request(
      `https://example.test/api/admin/users/${toUpdate.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ role: "editor", name: "Editor Two" }),
      }
    );

    const response = await userItemHandler.onRequestPatch({
      request,
      env,
      params: { id: String(toUpdate.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(toUpdate.id);
    expect(updated.role).toBe("editor");
    expect(updated.name).toBe("Editor Two");
    const audit = rawDb
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'user.updated' AND resource_id = ?"
      )
      .get(toUpdate.id);
    expect(audit).toBeTruthy();
  });

  test("cannot demote last admin", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const soleAdmin = rawDb
      .prepare("SELECT * FROM users WHERE role = 'admin'")
      .get();
    const request = new Request(
      `https://example.test/api/admin/users/${soleAdmin.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ role: "viewer" }),
      }
    );
    const response = await userItemHandler.onRequestPatch({
      request,
      env,
      params: { id: String(soleAdmin.id) },
    });
    expect(response.status).toBe(400);
    const stillAdmin = rawDb
      .prepare("SELECT role FROM users WHERE id = ?")
      .get(soleAdmin.id);
    expect(stillAdmin.role).toBe("admin");
  });

  test("admin deactivates user and sets deactivation metadata", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name) VALUES (?, ?, ?)")
      .run("tempuser@test.com", "viewer", "Temp User");
    const temp = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("tempuser@test.com");
    const request = new Request(
      `https://example.test/api/admin/users/${temp.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ isActive: false }),
      }
    );
    const response = await userItemHandler.onRequestPatch({
      request,
      env,
      params: { id: String(temp.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb
      .prepare(
        "SELECT is_active, deactivated_at, deactivated_by FROM users WHERE id = ?"
      )
      .get(temp.id);
    expect(updated.is_active).toBe(0);
    expect(updated.deactivated_at).toBeTruthy();
    expect(updated.deactivated_by).toBe(1); // admin user id
    const audit = rawDb
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'user.updated' AND resource_id = ?"
      )
      .get(temp.id);
    expect(audit).toBeTruthy();
  });

  test("cannot delete self", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const admin = rawDb
      .prepare("SELECT * FROM users WHERE role = 'admin'")
      .get();
    const request = new Request(
      `https://example.test/api/admin/users/${admin.id}`,
      {
        method: "DELETE",
        headers: { ...headers },
      }
    );
    const response = await userItemHandler.onRequestDelete({
      request,
      env,
      params: { id: String(admin.id) },
    });
    expect(response.status).toBe(400);
  });

  test("admin permanently deletes a non-admin user and logs action", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name) VALUES (?, ?, ?)")
      .run("delme@test.com", "viewer", "Del Me");
    const target = rawDb
      .prepare("SELECT * FROM users WHERE email = ?")
      .get("delme@test.com");
    const request = new Request(
      `https://example.test/api/admin/users/${target.id}`,
      {
        method: "DELETE",
        headers: { ...headers },
      }
    );
    const response = await userItemHandler.onRequestDelete({
      request,
      env,
      params: { id: String(target.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(target.id);
    expect(updated).toBeUndefined();
    const audit = rawDb
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'user.deleted' AND resource_id = ?"
      )
      .get(target.id);
    expect(audit).toBeTruthy();
  });
});
