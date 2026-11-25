import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, grantStepUp } from "../../../test-utils.js";
import * as userItemHandler from "../[id].js";
import * as toggleStatusHandler from "../[id]/toggle-status.js";
import * as activateHandler from "../../../auth/activate.js";
import * as resendHandler from "../../../auth/resend-activation.js";
import { hashStoredToken } from "../../../../utils/tokens.js";
import { toSqliteDateTime } from "../../../../utils/authAttempts.js";

afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const ctx = createTestEnv({ role: "admin" });
  grantStepUp(ctx.rawDb, ctx.sessionId);
  const digest = await hashStoredToken("invite-tok");
  const expires = toSqliteDateTime(new Date(Date.now() + 60 * 60 * 1000));
  ctx.rawDb
    .prepare(
      `INSERT INTO users (email, role, name, password_hash, is_active, activation_token, activation_token_expires_at)
       VALUES ('invitee@test.com', 'editor', 'Invitee', 'placeholder', 0, ?, ?)`,
    )
    .run(digest, expires);
  ctx.invitee = ctx.rawDb.prepare("SELECT id FROM users WHERE email = 'invitee@test.com'").get();
  return ctx;
}

const row = (rawDb, id) =>
  rawDb
    .prepare(
      "SELECT is_active, activated_at, activation_token, activation_token_expires_at, deactivated_at, deactivated_by FROM users WHERE id = ?",
    )
    .get(id);

function patch({ env, headers, invitee }, body) {
  return userItemHandler.onRequestPatch({
    request: new Request(`https://example.test/api/admin/users/${invitee.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    params: { id: String(invitee.id) },
  });
}

function toggle({ env, headers, invitee }) {
  return toggleStatusHandler.onRequestPost({
    request: new Request(`https://example.test/api/admin/users/${invitee.id}/toggle-status`, {
      method: "POST",
      headers,
    }),
    env,
    params: { id: String(invitee.id) },
  });
}

function post(handler, url, body, env) {
  return handler.onRequestPost({
    request: new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  });
}

describe("deactivating an invitee who has not activated", () => {
  it("PATCH isActive=false clears the activation token and stamps the deactivation", async () => {
    const ctx = await setup();
    // Seeded inactive already; reactivate first so the PATCH is a real deactivation.
    ctx.rawDb.prepare("UPDATE users SET is_active = 1 WHERE id = ?").run(ctx.invitee.id);
    const res = await patch(ctx, { isActive: false });
    expect(res.status).toBe(200);
    const u = row(ctx.rawDb, ctx.invitee.id);
    expect(u.is_active).toBe(0);
    expect(u.activation_token).toBeNull();
    expect(u.activation_token_expires_at).toBeNull();
    expect(u.deactivated_at).toBeTruthy();
  });

  it("toggle-status deactivation of an activated user clears a leftover token and stamps deactivated_at/by", async () => {
    const ctx = await setup();
    ctx.rawDb
      .prepare("UPDATE users SET is_active = 1, activated_at = datetime('now') WHERE id = ?")
      .run(ctx.invitee.id);
    const res = await toggle(ctx);
    expect(res.status).toBe(200);
    const u = row(ctx.rawDb, ctx.invitee.id);
    expect(u.is_active).toBe(0);
    expect(u.activation_token).toBeNull();
    expect(u.activation_token_expires_at).toBeNull();
    expect(u.deactivated_at).toBeTruthy();
    expect(u.deactivated_by).toBeTruthy();
  });

  it("toggle-status reactivation of an activated user clears deactivated_at/by and mints no token", async () => {
    const ctx = await setup();
    ctx.rawDb
      .prepare(
        "UPDATE users SET activated_at = datetime('now'), deactivated_at = datetime('now'), deactivated_by = 1, activation_token = NULL, activation_token_expires_at = NULL WHERE id = ?",
      )
      .run(ctx.invitee.id);
    const res = await toggle(ctx);
    expect(res.status).toBe(200);
    const u = row(ctx.rawDb, ctx.invitee.id);
    expect(u.is_active).toBe(1);
    expect(u.deactivated_at).toBeNull();
    expect(u.deactivated_by).toBeNull();
    expect(u.activation_token).toBeNull();
  });

  it("toggle-status refuses a pending invitee: 409 INVITE_PENDING, nothing written", async () => {
    const ctx = await setup(); // the real invitee state: is_active = 0, activated_at NULL
    const before = row(ctx.rawDb, ctx.invitee.id);
    const auditBefore = ctx.rawDb.prepare("SELECT COUNT(*) AS c FROM audit_log").get().c;
    const res = await toggle(ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVITE_PENDING");
    expect(row(ctx.rawDb, ctx.invitee.id)).toEqual(before);
    expect(before.is_active).toBe(0);
    expect(before.activation_token).toBeTruthy();
    expect(ctx.rawDb.prepare("SELECT COUNT(*) AS c FROM audit_log").get().c).toBe(auditBefore);
  });
});

describe("PATCH isActive: true on a never-activated invitee is an admin activation", () => {
  it("activates them: clears the stamp, sets activated_at, drops the link, and toggle-status treats them as activated", async () => {
    const ctx = await setup();
    ctx.rawDb
      .prepare(
        "UPDATE users SET deactivated_at = datetime('now'), deactivated_by = 1, activation_token = NULL, activation_token_expires_at = NULL WHERE id = ?",
      )
      .run(ctx.invitee.id);

    const res = await patch(ctx, { isActive: true });
    expect(res.status).toBe(200);
    const u = row(ctx.rawDb, ctx.invitee.id);
    expect(u.is_active).toBe(1);
    expect(u.deactivated_at).toBeNull();
    expect(u.deactivated_by).toBeNull();
    expect(u.activated_at).toBeTruthy();
    expect(u.activation_token).toBeNull();

    // An active account gets no activation email.
    const sends = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        sends.push(init?.body);
        return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      }),
    );
    Object.assign(ctx.env, {
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "test-key",
      EMAIL_FROM: "noreply@example.test",
    });
    const resend = await post(
      resendHandler,
      "https://example.test/api/auth/resend-activation",
      { email: "invitee@test.com" },
      ctx.env,
    );
    expect(resend.status).toBe(200);
    expect(sends).toHaveLength(0);
    expect(row(ctx.rawDb, ctx.invitee.id).activation_token).toBeNull();

    // activated_at is set, so a later toggle deactivates instead of answering INVITE_PENDING.
    const off = await toggle(ctx);
    expect(off.status).toBe(200);
    expect(row(ctx.rawDb, ctx.invitee.id).is_active).toBe(0);
  });
});
