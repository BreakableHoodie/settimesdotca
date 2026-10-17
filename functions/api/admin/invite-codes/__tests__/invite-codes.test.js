import { describe, it, expect } from "vitest";
import { createTestEnv, grantStepUp } from "../../../test-utils";
import * as inviteCodesHandler from "../../invite-codes.js";
import * as inviteCodeHandler from "../../invite-codes/[code].js";

describe("Admin invite codes API", () => {
  it("creates an invite code and lists it", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const createReq = new Request("https://example.test/api/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ role: "editor", expiresInDays: 3 }),
    });

    const createRes = await inviteCodesHandler.onRequestPost({
      request: createReq,
      env,
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.inviteCode).toHaveProperty("code");

    const listReq = new Request("https://example.test/api/admin/invite-codes", {
      headers,
    });
    const listRes = await inviteCodesHandler.onRequestGet({
      request: listReq,
      env,
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.inviteCodes.length).toBeGreaterThan(0);

    const found = list.inviteCodes.find((code) => code.code === created.inviteCode.code);
    expect(found).toBeDefined();

    const dbInvite = rawDb.prepare("SELECT * FROM invite_codes WHERE code = ?").get(created.inviteCode.code);
    expect(dbInvite).toBeTruthy();

    const audit = rawDb.prepare("SELECT * FROM audit_log WHERE action = 'invite_code.created' ORDER BY id DESC").get();
    expect(audit).toBeTruthy();
    const details = JSON.parse(audit.details);
    expect(details).toMatchObject({
      role: "editor",
      expiresInDays: 3,
      inviteMode: "open",
    });
    expect(details).not.toHaveProperty("code");
    expect(details).not.toHaveProperty("email");
  });

  it("rejects invalid role", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const createReq = new Request("https://example.test/api/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ role: "superuser" }),
    });

    const res = await inviteCodesHandler.onRequestPost({
      request: createReq,
      env,
    });
    expect(res.status).toBe(400);
  });

  it("rejects invite for existing user email", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const existingEmail = "existing-user@example.com";
    rawDb
      .prepare("INSERT INTO users (email, role, password_hash) VALUES (?, ?, 'placeholder')")
      .run(existingEmail, "viewer");

    const createReq = new Request("https://example.test/api/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ email: existingEmail }),
    });

    const res = await inviteCodesHandler.onRequestPost({
      request: createReq,
      env,
    });
    expect(res.status).toBe(409);
  });

  it("rejects an existing user's email in a different case", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    rawDb
      .prepare("INSERT INTO users (email, role, password_hash) VALUES (?, ?, 'placeholder')")
      .run("existing-user@example.com", "viewer");

    const res = await inviteCodesHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ email: " Existing-User@Example.COM " }),
      }),
      env,
    });
    expect(res.status).toBe(409);
  });

  // A blank email trimmed to "" would read as "no email" and mint an OPEN
  // invite the admin never asked for.
  it("rejects a whitespace-only email instead of minting an open invite", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const res = await inviteCodesHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ email: "   " }),
      }),
      env,
    });
    expect(res.status).toBe(400);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM invite_codes").get().n).toBe(0);
  });

  it("revokes an invite code", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const code = "test-revoke-code";
    rawDb
      .prepare("INSERT INTO invite_codes (code, role, created_by_user_id, expires_at) VALUES (?, ?, ?, ?)")
      .run(code, "editor", 1, new Date(Date.now() + 86400000).toISOString());

    const deleteReq = new Request(`https://example.test/api/admin/invite-codes/${code}`, { method: "DELETE", headers });
    const deleteRes = await inviteCodeHandler.onRequestDelete({
      request: deleteReq,
      env,
      params: { code },
    });
    expect(deleteRes.status).toBe(200);

    const updated = rawDb.prepare("SELECT is_active FROM invite_codes WHERE code = ?").get(code);
    expect(updated.is_active).toBe(0);

    const audit = rawDb.prepare("SELECT * FROM audit_log WHERE action = 'invite_code.revoked' ORDER BY id DESC").get();
    expect(audit).toBeTruthy();
    const details = JSON.parse(audit.details);
    expect(details).toMatchObject({ wasUsed: false, inviteMode: "open" });
    expect(details).not.toHaveProperty("code");
  });

  it("returns 404 when invite code does not exist", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const deleteReq = new Request("https://example.test/api/admin/invite-codes/does-not-exist", {
      method: "DELETE",
      headers,
    });
    const deleteRes = await inviteCodeHandler.onRequestDelete({
      request: deleteReq,
      env,
      params: { code: "does-not-exist" },
    });
    expect(deleteRes.status).toBe(404);
  });
});
