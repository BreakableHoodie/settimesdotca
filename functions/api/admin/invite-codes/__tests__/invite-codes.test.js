import { describe, it, expect } from "vitest";
import { createTestEnv, grantStepUp } from "../../../test-utils";
import * as inviteCodesHandler from "../../invite-codes.js";
import * as inviteCodeHandler from "../../invite-codes/[id].js";
import * as usersHandler from "../../users.js";
import * as signupHandler from "../../auth/signup.js";
import { hashInviteCode } from "../../../../utils/inviteCodes.js";

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

    const found = list.inviteCodes.find((row) => row.id === created.inviteCode.id);
    expect(found).toBeDefined();
    expect(found.code_prefix).toBe(created.inviteCode.code.slice(0, 8));

    // Stored as a digest, never the plaintext (#1334).
    const dbInvite = rawDb.prepare("SELECT * FROM invite_codes WHERE id = ?").get(created.inviteCode.id);
    expect(dbInvite.code).toBe(await hashInviteCode(created.inviteCode.code));
    expect(dbInvite.code).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(dbInvite.code_prefix).toBe(created.inviteCode.code.slice(0, 8));

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

    const { lastInsertRowid } = rawDb
      .prepare("INSERT INTO invite_codes (code, role, created_by_user_id, expires_at) VALUES (?, ?, ?, ?)")
      .run("sha256:test-revoke", "editor", 1, new Date(Date.now() + 86400000).toISOString());
    const id = String(lastInsertRowid);

    const deleteReq = new Request(`https://example.test/api/admin/invite-codes/${id}`, { method: "DELETE", headers });
    const deleteRes = await inviteCodeHandler.onRequestDelete({
      request: deleteReq,
      env,
      params: { id },
    });
    expect(deleteRes.status).toBe(200);

    const updated = rawDb.prepare("SELECT is_active FROM invite_codes WHERE id = ?").get(id);
    expect(updated.is_active).toBe(0);

    const audit = rawDb.prepare("SELECT * FROM audit_log WHERE action = 'invite_code.revoked' ORDER BY id DESC").get();
    expect(audit).toBeTruthy();
    const details = JSON.parse(audit.details);
    expect(details).toMatchObject({ wasUsed: false, inviteMode: "open" });
    expect(details).not.toHaveProperty("code");
  });

  it("rejects a non-numeric invite id", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    const res = await inviteCodeHandler.onRequestDelete({
      request: new Request("https://example.test/api/admin/invite-codes/abc", { method: "DELETE", headers }),
      env,
      params: { id: "abc" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when invite code does not exist", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);

    const deleteReq = new Request("https://example.test/api/admin/invite-codes/9999", {
      method: "DELETE",
      headers,
    });
    const deleteRes = await inviteCodeHandler.onRequestDelete({
      request: deleteReq,
      env,
      params: { id: "9999" },
    });
    expect(deleteRes.status).toBe(404);
  });
});

// #1334: the plaintext exists only in the creation response.
describe("Invite codes are stored hashed (#1334)", () => {
  async function createViaBothRoutes() {
    const t = createTestEnv({ role: "admin" });
    grantStepUp(t.rawDb, t.sessionId);
    const post = (handler, url, body) =>
      handler.onRequestPost({
        request: new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...t.headers },
          body: JSON.stringify(body),
        }),
        env: t.env,
      });
    const viaCodes = await (
      await post(inviteCodesHandler, "https://example.test/api/admin/invite-codes", { role: "admin" })
    ).json();
    const viaUsers = await (
      await post(usersHandler, "https://example.test/api/admin/users", {
        email: "hash-check@test.com",
        role: "editor",
        firstName: "Hash",
        lastName: "Check",
      })
    ).json();
    return { ...t, viaCodes, viaUsers };
  }

  it("GET returns neither the plaintext nor the stored digest, for invites made by either route", async () => {
    const { env, headers, rawDb, viaCodes, viaUsers } = await createViaBothRoutes();
    const plaintext = viaCodes.inviteCode.code;
    const urlCode = new URL(viaUsers.inviteUrl).searchParams.get("code");
    expect(urlCode).toBeTruthy();

    const res = await inviteCodesHandler.onRequestGet({
      request: new Request("https://example.test/api/admin/invite-codes", { headers }),
      env,
    });
    const raw = await res.text();
    expect(JSON.parse(raw).inviteCodes).toHaveLength(2);
    for (const secret of [plaintext, urlCode]) {
      expect(raw).not.toContain(secret);
      expect(raw).not.toContain(await hashInviteCode(secret));
    }
    expect(raw).not.toContain("sha256:");
    expect(raw).not.toMatch(/"code":/);
    // The prefix is what the list offers instead.
    expect(raw).toContain(plaintext.slice(0, 8));
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM invite_codes WHERE code LIKE 'sha256:%'").get().n).toBe(2);
  });

  it("POST /users returns an explicit invite projection with no digest and no plaintext", async () => {
    const { viaUsers } = await createViaBothRoutes();
    const urlCode = new URL(viaUsers.inviteUrl).searchParams.get("code");
    const serialised = JSON.stringify(viaUsers.invite);
    expect(serialised).not.toContain("sha256:");
    expect(serialised).not.toContain(urlCode);
    expect(Object.keys(viaUsers.invite).sort()).toEqual(["code_prefix", "email", "expires_at", "id", "role"]);
  });

  it("POST /invite-codes returns no digest", async () => {
    const { viaCodes } = await createViaBothRoutes();
    expect(JSON.stringify(viaCodes)).not.toContain("sha256:");
  });

  it("no audit row carries the plaintext or the digest", async () => {
    const { rawDb, viaCodes, viaUsers } = await createViaBothRoutes();
    const urlCode = new URL(viaUsers.inviteUrl).searchParams.get("code");
    const audit = JSON.stringify(rawDb.prepare("SELECT * FROM audit_log").all());
    expect(audit).not.toContain(viaCodes.inviteCode.code);
    expect(audit).not.toContain(urlCode);
    expect(audit).not.toContain("sha256:");
  });

  async function signup(env, inviteCode, email) {
    return signupHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "StrongPass1!", name: "Red Eemer", inviteCode }),
      }),
      env,
    });
  }

  it("redeems with the plaintext; the stored digest and retired: values redeem nothing", async () => {
    const { env, rawDb, viaCodes } = await createViaBothRoutes();
    env.ALLOW_ADMIN_SIGNUP = "true";
    const id = viaCodes.inviteCode.id;
    const stored = rawDb.prepare("SELECT code FROM invite_codes WHERE id = ?").get(id).code;
    expect(stored).toMatch(/^sha256:/);
    const claimed = () =>
      rawDb.prepare("SELECT used_by_user_id FROM invite_codes WHERE id = ?").get(id).used_by_user_id;

    expect((await signup(env, stored, "digest@test.com")).status).toBe(403);
    expect((await signup(env, `retired:${id}`, "retired@test.com")).status).toBe(403);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS n FROM users WHERE email IN (?, ?)").get("digest@test.com", "retired@test.com")
        .n,
    ).toBe(0);
    expect(claimed()).toBeNull();

    expect((await signup(env, viaCodes.inviteCode.code, "plain@test.com")).status).toBe(201);
    expect(claimed()).not.toBeNull();
  });
});
