// #1333: a TOTP code is accepted once per time step per user (RFC 6238 5.2).
//
// Every test here replays or races a code the endpoint already accepted (or
// is about to accept). The success half alone proves nothing: it is satisfied
// by an endpoint that never records the step.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, grantStepUp } from "../../../test-utils.js";
import { generateTotpCode } from "../../../../utils/totp.js";
import * as stepUpHandler from "../step-up.js";
import * as disableHandler from "../disable.js";
import * as backupCodesHandler from "../backup-codes.js";
import * as enableHandler from "../enable.js";
import * as setupHandler from "../setup.js";
import * as mfaVerifyHandler from "../../auth/mfa/verify.js";
import * as resetMfa from "../../users/[id]/reset-mfa.js";

const SECRET = "JBSWY3DPEHPK3PXP"; // createTestEnv's enrolled secret
const STEP_MS = 30_000;
const currentStep = () => Math.floor(Date.now() / STEP_MS);
const advanceOneStep = () => vi.setSystemTime(Date.now() + STEP_MS);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // A fixed instant at the start of a step, so "now" and "one step later" are
  // unambiguous. 2026-10-17T12:00:00Z is a multiple of 30 s.
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

// Simulates the parallel request that wins the race: just before this
// request's conditional step write runs, another request has already spent the
// step. Sequential replays are caught by the read-side check; only this
// interleaving exercises the conditional UPDATE itself.
function otherRequestSpendsStepFirst(env, rawDb, userId) {
  const prepare = env.DB.prepare.bind(env.DB);
  let fired = false;
  env.DB.prepare = (sql) => {
    if (!fired && sql.trimStart().startsWith("UPDATE users SET totp_last_step = ?")) {
      fired = true;
      rawDb.prepare("UPDATE users SET totp_last_step = ? WHERE id = ?").run(currentStep(), userId);
    }
    return prepare(sql);
  };
  return () => fired;
}

function postTo(handler, path, env, headers, body) {
  return handler.onRequestPost({
    request: new Request(`https://example.test/api/admin/mfa/${path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    data: {},
  });
}

const lastStep = (rawDb, userId) => rawDb.prepare("SELECT totp_last_step AS s FROM users WHERE id = ?").get(userId).s;

function seedChallenge(rawDb, userId = 1) {
  const mfaToken = crypto.randomUUID();
  rawDb
    .prepare(
      `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
       VALUES (?, ?, '127.0.0.1', 'test-agent', ?)`,
    )
    .run(mfaToken, userId, new Date(Date.now() + 5 * 60 * 1000).toISOString());
  return mfaToken;
}

function login(env, mfaToken, code) {
  return mfaVerifyHandler.onRequestPost({
    request: new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1", "User-Agent": "test-agent" },
      body: JSON.stringify({ mfaToken, code }),
    }),
    env,
  });
}

describe("login MFA step (auth/mfa/verify)", () => {
  it("accepts a code once and refuses its replay on a fresh challenge", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);

    expect((await login(env, seedChallenge(rawDb), code)).status).toBe(200);
    expect(lastStep(rawDb, 1)).toBe(currentStep());

    const sessionsBefore = rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 1").get().n;
    const replay = await login(env, seedChallenge(rawDb), code);
    expect(replay.status).toBe(401);
    expect((await replay.json()).message).toBe("Invalid authentication code");
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 1").get().n).toBe(sessionsBefore);
    expect(rawDb.prepare("SELECT failure_reason FROM auth_attempts WHERE success = 0").all()).toEqual([
      { failure_reason: "invalid_code" },
    ]);
  });

  it("accepts the next time-step's code", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    expect((await login(env, seedChallenge(rawDb), await generateTotpCode(SECRET))).status).toBe(200);
    advanceOneStep();
    expect((await login(env, seedChallenge(rawDb), await generateTotpCode(SECRET))).status).toBe(200);
    expect(lastStep(rawDb, 1)).toBe(currentStep());
  });

  it("refuses an older in-window step than the last one accepted", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const earlier = await generateTotpCode(SECRET, Date.now() - STEP_MS);
    advanceOneStep();
    expect((await login(env, seedChallenge(rawDb), await generateTotpCode(SECRET))).status).toBe(200);
    expect((await login(env, seedChallenge(rawDb), earlier)).status).toBe(401);
  });

  it("two parallel logins with the same code: exactly one gets a session", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    // One active challenge per user is itself a guard (markUsed), so isolate the
    // step claim: two challenges, which only a pre-existing second login (or a
    // challenge issued between the reads) could produce.
    rawDb.prepare("DROP INDEX idx_mfa_challenges_active_user").run();
    const code = await generateTotpCode(SECRET);
    const results = await Promise.all([login(env, seedChallenge(rawDb), code), login(env, seedChallenge(rawDb), code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("the conditional step write loses to a request that spent the step first: no session", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const fired = otherRequestSpendsStepFirst(env, rawDb, 1);
    const res = await login(env, seedChallenge(rawDb), await generateTotpCode(SECRET));
    expect(fired()).toBe(true);
    expect(res.status).toBe(401);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 1").get().n).toBe(1); // the seeded one
    expect(rawDb.prepare("SELECT used FROM mfa_challenges").get().used).toBe(0);
  });

  it("a reset that lands before the step is claimed wins: no session", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);
    const token = seedChallenge(rawDb);
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.startsWith("UPDATE users SET totp_last_step = ?")) {
        rawDb.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL WHERE id = 1").run();
      }
      return prepare(sql);
    };
    expect((await login(env, token, code)).status).toBe(401);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 1").get().n).toBe(1); // the seeded one
  });
});

describe("step-up (mfa/step-up)", () => {
  it("accepts a code once and refuses its replay without stamping", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);
    expect((await postTo(stepUpHandler, "step-up", env, headers, { code })).status).toBe(200);
    expect(lastStep(rawDb, 1)).toBe(currentStep());

    rawDb.prepare("UPDATE lucia_sessions SET step_up_at = NULL WHERE id = ?").run(sessionId);
    const replay = await postTo(stepUpHandler, "step-up", env, headers, { code });
    expect(replay.status).toBe(400);
    expect((await replay.json()).code).toBe("INVALID_MFA_CODE");
    expect(rawDb.prepare("SELECT step_up_at FROM lucia_sessions WHERE id = ?").get(sessionId).step_up_at).toBeNull();
  });

  it("accepts the next time-step's code", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    expect(
      (await postTo(stepUpHandler, "step-up", env, headers, { code: await generateTotpCode(SECRET) })).status,
    ).toBe(200);
    advanceOneStep();
    expect(
      (await postTo(stepUpHandler, "step-up", env, headers, { code: await generateTotpCode(SECRET) })).status,
    ).toBe(200);
    expect(lastStep(rawDb, 1)).toBe(currentStep());
  });

  it("two parallel step-ups with the same code: exactly one succeeds, the loser answers as a wrong code", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);
    const results = await Promise.all([
      postTo(stepUpHandler, "step-up", env, headers, { code }),
      postTo(stepUpHandler, "step-up", env, headers, { code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const loser = results.find((r) => r.status === 400);
    expect((await loser.json()).code).toBe("INVALID_MFA_CODE");
  });
});

describe("disable (mfa/disable)", () => {
  it("refuses a replayed code and leaves 2FA on; the next step's code disables it", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "viewer", mfaEnrolled: true });
    // The code was already accepted elsewhere (here: recorded directly).
    rawDb.prepare("UPDATE users SET totp_last_step = ? WHERE id = 3").run(currentStep());
    const replay = await postTo(disableHandler, "disable", env, headers, { code: await generateTotpCode(SECRET) });
    expect(replay.status).toBe(400);
    expect(rawDb.prepare("SELECT totp_enabled FROM users WHERE id = 3").get().totp_enabled).toBe(1);

    advanceOneStep();
    expect(
      (await postTo(disableHandler, "disable", env, headers, { code: await generateTotpCode(SECRET) })).status,
    ).toBe(200);
    const user = rawDb.prepare("SELECT totp_enabled, totp_secret, totp_last_step FROM users WHERE id = 3").get();
    expect(user).toEqual({ totp_enabled: 0, totp_secret: null, totp_last_step: null });
  });

  it("the conditional step write loses to a request that spent the step first: 2FA stays on", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "viewer", mfaEnrolled: true });
    const fired = otherRequestSpendsStepFirst(env, rawDb, 3);
    const res = await postTo(disableHandler, "disable", env, headers, { code: await generateTotpCode(SECRET) });
    expect(fired()).toBe(true);
    expect(res.status).toBe(400);
    expect(rawDb.prepare("SELECT totp_enabled FROM users WHERE id = 3").get().totp_enabled).toBe(1);
  });

  it("two parallel disables with the same code: exactly one succeeds", async () => {
    const { env, headers } = createTestEnv({ role: "viewer", mfaEnrolled: true });
    const code = await generateTotpCode(SECRET);
    const results = await Promise.all([
      postTo(disableHandler, "disable", env, headers, { code }),
      postTo(disableHandler, "disable", env, headers, { code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe("backup-code regeneration (mfa/backup-codes)", () => {
  it("accepts a code once; the replay gets no new codes and the stored list is untouched", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);
    const first = await postTo(backupCodesHandler, "backup-codes", env, headers, { code });
    expect(first.status).toBe(200);
    expect(lastStep(rawDb, 1)).toBe(currentStep());
    const storedAfterFirst = rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get().backup_codes;

    const replay = await postTo(backupCodesHandler, "backup-codes", env, headers, { code });
    expect(replay.status).toBe(400);
    expect((await replay.json()).backupCodes).toBeUndefined();
    expect(rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get().backup_codes).toBe(storedAfterFirst);
  });

  it("accepts the next time-step's code", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    expect(
      (await postTo(backupCodesHandler, "backup-codes", env, headers, { code: await generateTotpCode(SECRET) })).status,
    ).toBe(200);
    advanceOneStep();
    expect(
      (await postTo(backupCodesHandler, "backup-codes", env, headers, { code: await generateTotpCode(SECRET) })).status,
    ).toBe(200);
  });

  it("the conditional step write loses to a request that spent the step first: no codes issued", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const before = rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get().backup_codes;
    const fired = otherRequestSpendsStepFirst(env, rawDb, 1);
    const res = await postTo(backupCodesHandler, "backup-codes", env, headers, {
      code: await generateTotpCode(SECRET),
    });
    expect(fired()).toBe(true);
    expect(res.status).toBe(400);
    expect((await res.json()).backupCodes).toBeUndefined();
    expect(rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get().backup_codes).toBe(before);
  });

  it("two parallel regenerations with the same code: exactly one gets codes", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);
    const results = await Promise.all([
      postTo(backupCodesHandler, "backup-codes", env, headers, { code }),
      postTo(backupCodesHandler, "backup-codes", env, headers, { code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe("enrolment (mfa/enable)", () => {
  async function setUp() {
    const ctx = createTestEnv({ role: "admin", mfaEnrolled: false });
    const setupRes = await postTo(setupHandler, "setup", ctx.env, ctx.headers, {});
    const { secret } = await setupRes.json();
    return { ...ctx, secret };
  }

  it("records the step the enrolling code matched", async () => {
    const { env, rawDb, headers, secret } = await setUp();
    const res = await postTo(enableHandler, "enable", env, headers, { code: await generateTotpCode(secret) });
    expect(res.status).toBe(200);
    expect(lastStep(rawDb, 1)).toBe(currentStep());
  });

  it("refuses a code whose step was already accepted", async () => {
    const { env, rawDb, headers, secret } = await setUp();
    rawDb.prepare("UPDATE users SET totp_last_step = ? WHERE id = 1").run(currentStep());
    const res = await postTo(enableHandler, "enable", env, headers, { code: await generateTotpCode(secret) });
    expect(res.status).toBe(400);
    expect(rawDb.prepare("SELECT totp_enabled FROM users WHERE id = 1").get().totp_enabled).toBe(0);
  });

  it("a freshly enrolled user cannot reuse the enrolling code at step-up, but the next code works", async () => {
    const { env, rawDb, headers, secret, sessionId } = await setUp();
    const code = await generateTotpCode(secret);
    const enableRes = await postTo(enableHandler, "enable", env, headers, { code });
    const cookie = enableRes.headers.getSetCookie().find((v) => /session_token=/.test(v));
    const newSession = cookie.split(";")[0].split("=")[1];
    const authed = { ...headers, Authorization: `Bearer ${newSession}` };
    expect(sessionId).not.toBe(newSession);

    expect((await postTo(stepUpHandler, "step-up", env, authed, { code })).status).toBe(400);
    advanceOneStep();
    expect((await postTo(stepUpHandler, "step-up", env, authed, { code: await generateTotpCode(secret) })).status).toBe(
      200,
    );
    expect(rawDb.prepare("SELECT totp_enabled FROM users WHERE id = 1").get().totp_enabled).toBe(1);
  });
});

describe("a new secret starts with no spent step", () => {
  it("setup resets totp_last_step", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    rawDb.prepare("UPDATE users SET totp_last_step = 99999999 WHERE id = 1").run();
    expect((await postTo(setupHandler, "setup", env, headers, {})).status).toBe(200);
    expect(lastStep(rawDb, 1)).toBeNull();
  });

  it("admin reset-mfa clears totp_last_step so the new authenticator is not refused", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    rawDb.prepare("UPDATE users SET totp_last_step = ? WHERE id = 2").run(currentStep() + 5);
    const res = await resetMfa.onRequestPost({
      request: new Request("https://example.test/api/admin/users/2/reset-mfa", { method: "POST", headers }),
      env,
      params: { id: "2" },
      data: {},
    });
    expect(res.status).toBe(200);
    expect(lastStep(rawDb, 2)).toBeNull();
  });
});
