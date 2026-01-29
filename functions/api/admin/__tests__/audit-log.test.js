import { describe, it, expect } from "vitest";
import { createTestEnv } from "../../test-utils";
import * as auditLogHandler from "../audit-log.js";

describe("Admin audit log API", () => {
  it("returns logs with pagination metadata", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });

    rawDb
      .prepare(
        "INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(1, "event.created", "event", 10, JSON.stringify({ name: "A" }), "127.0.0.1");
    rawDb
      .prepare(
        "INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(1, "event.updated", "event", 11, JSON.stringify({ name: "B" }), "127.0.0.1");

    const req = new Request(
      "https://example.test/api/admin/audit-log?limit=1&offset=0",
      { headers },
    );
    const res = await auditLogHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    expect(data.limit).toBe(1);
    expect(data.hasMore).toBe(true);
    expect(data.logs.length).toBe(1);
    expect(data.logs[0]).toHaveProperty("details");
  });

  it("filters by action and user_id", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });

    rawDb
      .prepare(
        "INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(1, "user.created", "user", 99, JSON.stringify({ email: "x@test" }), "127.0.0.1");
    rawDb
      .prepare(
        "INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(2, "user.updated", "user", 98, JSON.stringify({ email: "y@test" }), "127.0.0.1");

    const req = new Request(
      "https://example.test/api/admin/audit-log?user_id=1&action=user.created",
      { headers },
    );
    const res = await auditLogHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.logs[0].action).toBe("user.created");
    expect(data.logs[0].userId).toBe(1);
  });

  it("rejects limit over 100", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const req = new Request(
      "https://example.test/api/admin/audit-log?limit=250",
      { headers },
    );
    const res = await auditLogHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(400);
  });
});
