// #1318: moving to a new authenticator app while 2FA is on, and the notice
// emailed when 2FA is turned on.
//
// Every "refused" test asserts the DATABASE is unchanged, not just the status:
// a refusal that still stored a pending secret would pass a status-only check.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, grantStepUp } from "../../../test-utils.js";
import { generateTotpCode, hashBackupCode } from "../../../../utils/totp.js";
import { decryptTotpSecret, isEncryptedTotpSecret } from "../../../../utils/mfaSecrets.js";
import { AUTH_ATTEMPT_TYPES, MFA_GUESS_LIMIT } from "../../../../utils/authAttempts.js";
import * as setupHandler from "../setup.js";
import * as enableHandler from "../enable.js";
import * as disableHandler from "../disable.js";
import * as backupHandler from "../backup-codes.js";
import * as mfaVerifyHandler from "../../auth/mfa/verify.js";
import * as resetMfa from "../../users/[id]/reset-mfa.js";

const mockSendEmail = vi.hoisted(() => vi.fn());
const mockIsEmailConfigured = vi.hoisted(() => vi.fn());
vi.mock("../../../../utils/email.js", async (importOriginal) => ({
  ...(await importOriginal()),
  sendEmail: mockSendEmail,
  isEmailConfigured: mockIsEmailConfigured,
}));

const SECRET = "JBSWY3DPEHPK3PXP"; // createTestEnv's enrolled secret
const STEP_MS = 30_000;
const currentStep = () => Math.floor(Date.now() / STEP_MS);
const advanceOneStep = () => vi.setSystemTime(Date.now() + STEP_MS);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z")); // the start of a step
  mockSendEmail.mockReset().mockResolvedValue({ delivered: true });
  mockIsEmailConfigured.mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
});

// The URL matters: the 2FA gate allows only the enrolment routes through for an
// unenrolled admin, by path.
const PATHS = new Map([
  [setupHandler, "setup"],
  [enableHandler, "enable"],
  [disableHandler, "disable"],
  [backupHandler, "backup-codes"],
]);

function post(handler, env, headers, body, extra = {}) {
  return handler.onRequestPost({
    request: new Request(`https://example.test/api/admin/mfa/${PATHS.get(handler)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
      body: JSON.stringify(body ?? {}),
    }),
    env,
    data: {},
    ...extra,
  });
}

const row = (rawDb, id = 1) =>
  rawDb
    .prepare(
      "SELECT totp_enabled, totp_secret, totp_pending_secret, backup_codes, totp_last_step FROM users WHERE id = ?",
    )
    .get(id);

const sessionIdFrom = (response) =>
  response.headers
    .getSetCookie()
    .find((value) => /session_token=/.test(value))
    .split(";")[0]
    .split("=")[1];

function seedChallenge(rawDb, userId = 1) {
  const token = crypto.randomUUID();
  rawDb.prepare("DELETE FROM mfa_challenges WHERE user_id = ?").run(userId);
  rawDb
    .prepare(
      `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
       VALUES (?, ?, '127.0.0.1', 'test-agent', datetime('now', '+5 minutes'))`,
    )
    .run(token, userId);
  return token;
}

const login = (env, rawDb, code) =>
  mfaVerifyHandler.onRequestPost({
    request: new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1", "User-Agent": "test-agent" },
      body: JSON.stringify({ mfaToken: seedChallenge(rawDb), code }),
    }),
    env,
  });

// Start a re-enrolment with the live secret; returns the new plaintext secret.
async function startReenrol(env, headers) {
  const response = await post(setupHandler, env, headers, { code: await generateTotpCode(SECRET) });
  expect(response.status).toBe(200);
  return (await response.json()).secret;
}

describe("mfa/setup while 2FA is on (#1318)", () => {
  it("without a code: 409 MFA_CODE_REQUIRED_TO_REENROL and nothing is stored", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const before = row(rawDb);
    const response = await post(setupHandler, env, headers, {});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("MFA_CODE_REQUIRED_TO_REENROL");
    expect(row(rawDb)).toEqual(before);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM auth_attempts").get().n).toBe(0);
  });

  it("with a current TOTP code: stores the new secret as PENDING and leaves the live one alone", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const response = await post(setupHandler, env, headers, { code: await generateTotpCode(SECRET) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.otpauthUrl).toContain("otpauth://totp/");
    expect(payload.secret).not.toBe(SECRET);

    const stored = row(rawDb);
    expect(stored.totp_enabled).toBe(1);
    expect(stored.totp_secret).toBe(SECRET);
    expect(isEncryptedTotpSecret(stored.totp_pending_secret)).toBe(true);
    expect(await decryptTotpSecret(stored.totp_pending_secret, env)).toBe(payload.secret);
    expect(stored.totp_last_step).toBe(currentStep());
    expect(
      rawDb.prepare("SELECT success FROM auth_attempts WHERE attempt_type = ?").all(AUTH_ATTEMPT_TYPES.mfaReenrol),
    ).toEqual([{ success: 1 }]);
  });

  it("with a backup code: stores the pending secret and the code is spent exactly once", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const hashed = [await hashBackupCode("AAAAA-BBBBB"), await hashBackupCode("CCCCC-DDDDD")];
    rawDb.prepare("UPDATE users SET backup_codes = ? WHERE id = 1").run(JSON.stringify(hashed));

    const first = await post(setupHandler, env, headers, { code: "AAAAA-BBBBB" });
    expect(first.status).toBe(200);
    expect(JSON.parse(row(rawDb).backup_codes)).toHaveLength(1);
    expect(row(rawDb).totp_pending_secret).toBeTruthy();

    rawDb.prepare("UPDATE users SET totp_pending_secret = NULL WHERE id = 1").run();
    const again = await post(setupHandler, env, headers, { code: "AAAAA-BBBBB" });
    expect(again.status).toBe(400);
    expect((await again.json()).code).toBe("INVALID_MFA_CODE");
    expect(row(rawDb).totp_pending_secret).toBeNull();
  });

  it("with the live secret unreadable, a backup code still starts the move to a new app", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("UPDATE users SET totp_secret = 'enc-v1:bm90LXZhbGlk:bm90LXZhbGlk', backup_codes = ? WHERE id = 1")
      .run(JSON.stringify([await hashBackupCode("AAAAA-BBBBB")]));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post(setupHandler, env, headers, { code: "AAAAA-BBBBB" });
    expect(response.status).toBe(200);
    expect(row(rawDb).totp_pending_secret).toBeTruthy();
    expect(row(rawDb).backup_codes).toBeNull(); // the only code, spent
    errors.mockRestore();
  });

  it("with the live secret unreadable and no valid backup code: 500, recorded, nothing stored", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb.prepare("UPDATE users SET totp_secret = 'enc-v1:bm90LXZhbGlk:bm90LXZhbGlk' WHERE id = 1").run();
    const before = row(rawDb);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post(setupHandler, env, headers, { code: "123456" });
    expect(response.status).toBe(500);
    expect(row(rawDb)).toEqual(before);
    expect(
      rawDb
        .prepare("SELECT success, failure_reason FROM auth_attempts WHERE attempt_type = ?")
        .all(AUTH_ATTEMPT_TYPES.mfaReenrol),
    ).toEqual([{ success: 0, failure_reason: "totp_secret_error" }]);
    errors.mockRestore();
  });

  it("with a wrong code: nothing stored, the miss is recorded, and it counts toward the guess limit", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    const good = await generateTotpCode(SECRET);
    const response = await post(setupHandler, env, headers, { code: good === "000000" ? "111111" : "000000" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_MFA_CODE");
    expect(row(rawDb).totp_pending_secret).toBeNull();
    expect(
      rawDb
        .prepare("SELECT success, failure_reason FROM auth_attempts WHERE attempt_type = ?")
        .all(AUTH_ATTEMPT_TYPES.mfaReenrol),
    ).toEqual([{ success: 0, failure_reason: "invalid_code" }]);

    // The budget is shared: guesses spent here lock the OTHER endpoints out.
    const insert = rawDb.prepare(
      "INSERT INTO auth_attempts (user_id, ip_address, attempt_type, success, failure_reason) VALUES (1, ?, ?, 0, 'invalid_code')",
    );
    for (let i = 0; i < MFA_GUESS_LIMIT.maxFailures; i += 1) insert.run(`10.0.0.${i}`, AUTH_ATTEMPT_TYPES.mfaReenrol);
    advanceOneStep();
    const locked = await post(backupHandler, env, headers, { code: await generateTotpCode(SECRET) });
    expect(locked.status).toBe(401);
    expect((await locked.json()).code).toBe("STEP_UP_LOCKED");
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE id = ?").get(sessionId).n).toBe(0);
  });

  it("a replayed step is refused as already used and stores nothing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const code = await generateTotpCode(SECRET);
    expect((await post(setupHandler, env, headers, { code })).status).toBe(200);
    const pending = row(rawDb).totp_pending_secret;

    const replay = await post(setupHandler, env, headers, { code });
    expect(replay.status).toBe(400);
    expect((await replay.json()).code).toBe("TOTP_CODE_ALREADY_USED");
    expect(row(rawDb).totp_pending_secret).toBe(pending);
  });

  it("a parallel admin reset wins: the pending write matches nothing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("UPDATE users SET totp_pending_secret = ?")) {
        rawDb
          .prepare(
            "UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL, backup_codes = NULL WHERE id = 1",
          )
          .run();
      }
      return prepare(sql);
    };
    const response = await post(setupHandler, env, headers, { code: await generateTotpCode(SECRET) });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("MFA_SETUP_CHANGED");
    expect(row(rawDb).totp_pending_secret).toBeNull();
    expect(row(rawDb).totp_enabled).toBe(0);
  });

  it("first-time setup overwrites and clears any leftover pending secret", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    rawDb.prepare("UPDATE users SET totp_pending_secret = 'enc-v1:stale' WHERE id = 1").run();
    expect((await post(setupHandler, env, headers, {})).status).toBe(200);
    expect(row(rawDb).totp_pending_secret).toBeNull();
  });
});

describe("a pending secret never authenticates (#1318)", () => {
  it("the old secret still logs in until enable; the pending one cannot", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);

    advanceOneStep();
    const pendingLogin = await login(env, rawDb, await generateTotpCode(newSecret));
    expect(pendingLogin.status).toBe(401);

    const oldLogin = await login(env, rawDb, await generateTotpCode(SECRET));
    expect(oldLogin.status).toBe(200);
  });
});

describe("mfa/enable while re-enrolling (#1318)", () => {
  it("swaps the secrets, returns new backup codes, revokes old sessions and issues a fresh one", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    rawDb.prepare("UPDATE users SET backup_codes = ? WHERE id = 1").run(JSON.stringify(["old-hash"]));
    rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES ('other-session', 1, ?)")
      .run(Math.floor(Date.now() / 1000) + 3600);
    const newSecret = await startReenrol(env, headers);

    advanceOneStep();
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(newSecret) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.backupCodes.length).toBeGreaterThan(0);

    const stored = row(rawDb);
    expect(stored.totp_enabled).toBe(1);
    expect(stored.totp_pending_secret).toBeNull();
    expect(await decryptTotpSecret(stored.totp_secret, env)).toBe(newSecret);
    expect(stored.totp_last_step).toBe(currentStep());
    expect(stored.backup_codes).not.toContain("old-hash");

    const sessions = rawDb.prepare("SELECT id FROM lucia_sessions WHERE user_id = 1").all();
    expect(sessions).toEqual([{ id: sessionIdFrom(response) }]);
    expect(sessions.map((s) => s.id)).not.toContain(sessionId);

    // The old app is dead; the new one logs in.
    advanceOneStep();
    expect((await login(env, rawDb, await generateTotpCode(SECRET))).status).toBe(401);
    expect((await login(env, rawDb, await generateTotpCode(newSecret))).status).toBe(200);
  });

  it("a wrong code leaves both secrets exactly as they were", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    const before = row(rawDb);
    advanceOneStep();
    const good = await generateTotpCode(newSecret);
    const response = await post(enableHandler, env, headers, { code: good === "000000" ? "111111" : "000000" });
    expect(response.status).toBe(400);
    expect(row(rawDb)).toEqual(before);
  });

  it("a code from the OLD app does not confirm the new one", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    await startReenrol(env, headers);
    const before = row(rawDb);
    advanceOneStep();
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(SECRET) });
    expect(response.status).toBe(400);
    expect(row(rawDb)).toEqual(before);
  });

  it("an abandoned re-enrolment expires: past the window the right code promotes nothing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    const before = row(rawDb);
    vi.setSystemTime(Date.now() + (enableHandler.PENDING_SECRET_TTL_SECONDS + 1) * 1000);
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(newSecret) });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("MFA_REENROL_EXPIRED");
    expect(row(rawDb)).toEqual(before);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("is still confirmable just inside the window", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    vi.setSystemTime(Date.now() + (enableHandler.PENDING_SECRET_TTL_SECONDS - 30) * 1000);
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(newSecret) });
    expect(response.status).toBe(200);
    expect(await decryptTotpSecret(row(rawDb).totp_secret, env)).toBe(newSecret);
  });

  it("a wrong confirmation is recorded as a re-enrolment guess, written before the check", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    advanceOneStep();
    const good = await generateTotpCode(newSecret);
    const response = await post(enableHandler, env, headers, { code: good === "000000" ? "111111" : "000000" });
    expect(response.status).toBe(400);
    expect(
      rawDb
        .prepare("SELECT success, failure_reason FROM auth_attempts WHERE attempt_type = ? ORDER BY id")
        .all(AUTH_ATTEMPT_TYPES.mfaReenrol),
    ).toEqual([
      { success: 1, failure_reason: null }, // the setup that started it
      { success: 0, failure_reason: "invalid_code" },
    ]);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE attempt_type = ?").get(AUTH_ATTEMPT_TYPES.mfaEnable)
        .n,
    ).toBe(0);
  });

  it("shares the per-user guess limit: guesses spread across IPs elsewhere lock confirmation out", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    const before = row(rawDb);
    const insert = rawDb.prepare(
      "INSERT INTO auth_attempts (user_id, ip_address, attempt_type, success, failure_reason) VALUES (1, ?, ?, 0, 'invalid_code')",
    );
    for (let i = 0; i < MFA_GUESS_LIMIT.maxFailures; i += 1) insert.run(`10.0.0.${i}`, AUTH_ATTEMPT_TYPES.mfaStepUp);
    advanceOneStep();
    // Even the RIGHT code is refused once the budget is spent.
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(newSecret) });
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("STEP_UP_LOCKED");
    expect(row(rawDb)).toEqual(before);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("with 2FA on and nothing pending, enable is still refused", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const before = row(rawDb);
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(SECRET) });
    expect(response.status).toBe(409);
    expect(row(rawDb)).toEqual(before);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("a second setup that replaces the pending secret mid-confirm wins: 409, the first code promotes nothing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const firstSecret = await startReenrol(env, headers);
    advanceOneStep();
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("totp_pending_secret = NULL, backup_codes")) {
        rawDb.prepare("UPDATE users SET totp_pending_secret = 'enc-v1:replaced' WHERE id = 1").run();
      }
      return prepare(sql);
    };
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(firstSecret) });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("MFA_SETUP_CHANGED");
    expect(row(rawDb)).toMatchObject({ totp_secret: SECRET, totp_pending_secret: "enc-v1:replaced" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("a parallel admin reset wins: 409 MFA_SETUP_CHANGED, nothing resurrected", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    advanceOneStep();
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("totp_pending_secret = NULL, backup_codes")) {
        rawDb
          .prepare(
            "UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL, backup_codes = NULL WHERE id = 1",
          )
          .run();
      }
      return prepare(sql);
    };
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(newSecret) });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("MFA_SETUP_CHANGED");
    expect(row(rawDb)).toMatchObject({ totp_enabled: 0, totp_secret: null, totp_pending_secret: null });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("paths that clear the factor clear the pending secret (#1318)", () => {
  it("disable", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "viewer", mfaEnrolled: true });
    expect((await post(setupHandler, env, headers, { code: await generateTotpCode(SECRET) })).status).toBe(200);
    expect(row(rawDb, 3).totp_pending_secret).toBeTruthy();
    advanceOneStep();
    expect((await post(disableHandler, env, headers, { code: await generateTotpCode(SECRET) })).status).toBe(200);
    expect(row(rawDb, 3)).toMatchObject({ totp_enabled: 0, totp_secret: null, totp_pending_secret: null });
  });

  it("admin reset-mfa", async () => {
    const { env, rawDb, headers, sessionId } = createTestEnv({ role: "admin" });
    grantStepUp(rawDb, sessionId);
    rawDb
      .prepare(
        "UPDATE users SET totp_enabled = 1, totp_secret = 'enc:live', totp_pending_secret = 'enc:pending' WHERE id = 2",
      )
      .run();
    const response = await resetMfa.onRequestPost({
      request: new Request("https://example.test/api/admin/users/2/reset-mfa", { method: "POST", headers }),
      env,
      params: { id: "2" },
      data: {},
    });
    expect(response.status).toBe(200);
    expect(row(rawDb, 2)).toMatchObject({ totp_enabled: 0, totp_secret: null, totp_pending_secret: null });
  });
});

describe("the enrolment notice (#1318)", () => {
  async function firstEnrol(env, headers) {
    const setup = await post(setupHandler, env, headers, {});
    const { secret } = await setup.json();
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(secret) });
    return { secret, response, payload: await response.clone().json() };
  }

  it("is sent once on first enable, to the account address, with no secret or backup code in it", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const { secret, response, payload } = await firstEnrol(env, headers);
    expect(response.status).toBe(200);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [, message] = mockSendEmail.mock.calls[0];
    const email = rawDb.prepare("SELECT email FROM users WHERE id = 1").get().email;
    expect(message.to).toBe(email);
    expect(message.subject).toMatch(/turned on/i);
    expect(message.text).toContain("203.0.113.9");
    expect(message.text).toMatch(/contact an admin immediately/i);
    for (const forbidden of [secret, ...payload.backupCodes, "http"]) {
      expect(message.text).not.toContain(forbidden);
      expect(message.html).not.toContain(forbidden);
    }
    expect(JSON.stringify(message)).not.toContain(stored(rawDb));
  });

  function stored(rawDb) {
    return rawDb.prepare("SELECT totp_secret FROM users WHERE id = 1").get().totp_secret;
  }

  it("is sent on re-enrolment, worded as a move to a new app", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const newSecret = await startReenrol(env, headers);
    expect(mockSendEmail).not.toHaveBeenCalled(); // starting is not enrolling
    advanceOneStep();
    expect((await post(enableHandler, env, headers, { code: await generateTotpCode(newSecret) })).status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][1].subject).toMatch(/new app/i);
  });

  it("a send that rejects never fails the enable", async () => {
    mockSendEmail.mockRejectedValue(new Error("provider down"));
    const { env, rawDb, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const { response } = await firstEnrol(env, headers);
    expect(response.status).toBe(200);
    expect(row(rawDb).totp_enabled).toBe(1);
  });

  it("a send reported undelivered never fails the enable", async () => {
    mockSendEmail.mockResolvedValue({ delivered: false, reason: "provider_error" });
    const { env, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    expect((await firstEnrol(env, headers)).response.status).toBe(200);
  });

  it("is skipped, logged as an error, when email is not configured", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockIsEmailConfigured.mockReturnValue(false);
    const { env, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    expect((await firstEnrol(env, headers)).response.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/notice not sent: email delivery is not configured/),
    );
    consoleError.mockRestore();
  });

  it("is sent even when a step after the commit throws", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const setup = await post(setupHandler, env, headers, {});
    const { secret } = await setup.json();
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("UPDATE lucia_sessions SET ip_address")) throw new Error("D1 blip");
      return prepare(sql);
    };
    await expect(post(enableHandler, env, headers, { code: await generateTotpCode(secret) })).rejects.toThrow(
      "D1 blip",
    );
    expect(row(rawDb).totp_enabled).toBe(1); // the factor committed
    expect(mockSendEmail).toHaveBeenCalledTimes(1); // so the owner hears about it
  });

  it("failing to record the success never fails a committed enable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, rawDb, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const setup = await post(setupHandler, env, headers, {});
    const { secret } = await setup.json();
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("INSERT INTO auth_attempts")) throw new Error("D1 blip");
      return prepare(sql);
    };
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(secret) });
    expect(response.status).toBe(200);
    expect((await response.json()).backupCodes.length).toBeGreaterThan(0);
    expect(row(rawDb).totp_enabled).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to record successful enrolment/),
      "D1 blip",
    );
    consoleError.mockRestore();
  });

  it("is handed to waitUntil when the platform provides it", async () => {
    const waitUntil = vi.fn();
    const { env, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const setup = await post(setupHandler, env, headers, {});
    const { secret } = await setup.json();
    const response = await post(enableHandler, env, headers, { code: await generateTotpCode(secret) }, { waitUntil });
    expect(response.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("is not sent when enable fails", async () => {
    const { env, headers } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const setup = await post(setupHandler, env, headers, {});
    const { secret } = await setup.json();
    const good = await generateTotpCode(secret);
    const response = await post(enableHandler, env, headers, { code: good === "000000" ? "111111" : "000000" });
    expect(response.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
