// POST /api/admin/mfa/step-up (#1324)
import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import { generateTotpCode, hashBackupCode } from "../../../../utils/totp.js";
import { onRequest } from "../../_middleware.js";
import { generateApiKey } from "../../../../utils/apiKeys.js";
import * as stepUpHandler from "../step-up.js";

const SECRET = "JBSWY3DPEHPK3PXP"; // createTestEnv's enrolled secret

async function post(env, headers, body, data) {
  return stepUpHandler.onRequestPost({
    request: new Request("https://example.test/api/admin/mfa/step-up", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    data: data ?? {},
  });
}

const stamp = (rawDb, sessionId) =>
  rawDb.prepare("SELECT step_up_at FROM lucia_sessions WHERE id = ?").get(sessionId).step_up_at;

describe("POST /api/admin/mfa/step-up", () => {
  it("a valid TOTP stamps this session, and only this session", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES ('other', 1, ?)")
      .run(Math.floor(Date.now() / 1000) + 3600);
    expect(stamp(rawDb, sessionId)).toBeNull();

    const before = Math.floor(Date.now() / 1000);
    const response = await post(env, headers, { code: await generateTotpCode(SECRET) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(new Date(payload.stepUpExpiresAt).getTime()).toBeGreaterThan(Date.now() + 290_000);
    expect(stamp(rawDb, sessionId)).toBeGreaterThanOrEqual(before);
    expect(stamp(rawDb, "other")).toBeNull();
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'mfa.step_up'").get().n).toBe(1);
  });

  it("a wrong code is 401 and stamps nothing", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    const good = await generateTotpCode(SECRET);
    const wrong = good === "000000" ? "111111" : "000000";
    const response = await post(env, headers, { code: wrong });
    expect(response.status).toBe(401);
    expect(stamp(rawDb, sessionId)).toBeNull();
  });

  it("requires a code", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    expect((await post(env, headers, {})).status).toBe(400);
    expect((await post(env, headers, { code: 123456 })).status).toBe(400);
  });

  it("a backup code works once, is consumed, and cannot be replayed", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    const hashed = await hashBackupCode("ABCD1234EF");
    const spare = await hashBackupCode("ZZZZ9999YY");
    rawDb.prepare("UPDATE users SET backup_codes = ? WHERE id = 1").run(JSON.stringify([hashed, spare]));

    const first = await post(env, headers, { code: "ABCD1234EF" });
    expect(first.status).toBe(200);
    expect(stamp(rawDb, sessionId)).not.toBeNull();
    expect(JSON.parse(rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get().backup_codes)).toEqual([
      spare,
    ]);

    rawDb.prepare("UPDATE lucia_sessions SET step_up_at = NULL WHERE id = ?").run(sessionId);
    const replay = await post(env, headers, { code: "ABCD1234EF" });
    expect(replay.status).toBe(401);
    expect(stamp(rawDb, sessionId)).toBeNull();
  });

  it("two concurrent requests spending the same backup code: exactly one wins", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("UPDATE users SET backup_codes = ? WHERE id = 1")
      .run(JSON.stringify([await hashBackupCode("ABCD1234EF"), await hashBackupCode("ZZZZ9999YY")]));
    const results = await Promise.all([
      post(env, headers, { code: "ABCD1234EF" }),
      post(env, headers, { code: "ABCD1234EF" }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(JSON.parse(rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get().backup_codes)).toHaveLength(1);
  });

  it("does not stamp when the backup-code list changed under it", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("UPDATE users SET backup_codes = ? WHERE id = 1")
      .run(JSON.stringify([await hashBackupCode("ABCD1234EF")]));
    // The write is conditioned on the list that was read: swap it in between the
    // read and the write by wrapping the DB so the first backup_codes UPDATE
    // sees a different list.
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB = {
      ...env.DB,
      prepare(sql) {
        if (/^\s*UPDATE users SET backup_codes/.test(sql)) {
          rawDb.prepare("UPDATE users SET backup_codes = '[\"changed\"]' WHERE id = 1").run();
        }
        return realPrepare(sql);
      },
    };
    const response = await post(env, headers, { code: "ABCD1234EF" });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("MFA_CHANGED");
    expect(stamp(rawDb, sessionId)).toBeNull();
  });

  it("rate limits repeated wrong codes, even when the next code is right", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    const good = await generateTotpCode(SECRET);
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      expect((await post(env, headers, { code: wrong })).status).toBe(401);
    }
    const blocked = await post(env, headers, { code: good });
    expect(blocked.status).toBe(429);
    expect(stamp(rawDb, sessionId)).toBeNull();
  });

  it("a viewer without 2FA gets MFA_NOT_ENABLED", async () => {
    const { env, headers } = createTestEnv({ role: "viewer", mfaEnrolled: false });
    const response = await post(env, headers, { code: "123456" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("MFA_NOT_ENABLED");
  });

  it("fails closed with 401 when the request carries no session id", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    // data.user present but no data.session: nothing to stamp.
    const response = await post(
      env,
      headers,
      { code: await generateTotpCode(SECRET) },
      {
        user: { userId: 1, role: "admin" },
      },
    );
    expect(response.status).toBe(401);
    expect(stamp(rawDb, sessionId)).toBeNull();
  });

  it("is refused for an API key by the middleware, before the handler runs", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const generated = await generateApiKey(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
    rawDb
      .prepare(
        "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, expires_at) VALUES ('k', ?, ?, 'admin', 1, ?)",
      )
      .run(generated.keyPrefix, generated.keyHash, generated.expiresAt);
    let reached = false;
    const context = {
      env,
      data: {},
      params: {},
      request: new Request("https://example.test/api/admin/mfa/step-up", {
        method: "POST",
        headers: { Authorization: `Bearer ${generated.plaintext}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: await generateTotpCode(SECRET) }),
      }),
    };
    context.next = async () => {
      reached = true;
      return stepUpHandler.onRequestPost(context);
    };
    const response = await onRequest(context);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("KEY_NOT_PERMITTED");
    expect(reached).toBe(false);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE step_up_at IS NOT NULL").get().n).toBe(0);
  });

  it("the handler itself also refuses a key context (backstop)", async () => {
    const { env, headers, rawDb, sessionId } = createTestEnv({ role: "admin" });
    const response = await post(
      env,
      headers,
      { code: await generateTotpCode(SECRET) },
      {
        user: { userId: 1, role: "admin" },
        apiKey: { id: 1 },
        session: { id: sessionId, user_id: 1 },
      },
    );
    expect(response.status).toBe(403);
    expect(stamp(rawDb, sessionId)).toBeNull();
  });
});
