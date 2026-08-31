// Tests for POST /api/admin/auth/login
// Focus: account-enumeration fix (password verified before account-state revealed)
// and confirming the correct requiresActivation behaviour.

import { describe, test, expect, beforeAll } from "vitest";
import { onRequestPost } from "../auth/login.js";
import { createTestDB, createDBEnv } from "../../test-utils.js";
import { hashPassword } from "../../../utils/crypto.js";

// Non-secret unit-test fixtures (the "test" marker keeps secret scanners quiet).
const TEST_PASSWORD = "correct-test-password";
const WRONG_PASSWORD = "wrong-test-password";

let passwordHash;

// Compute the hash once for the whole suite to avoid repeating 600 k PBKDF2 rounds.
beforeAll(async () => {
  passwordHash = await hashPassword(TEST_PASSWORD);
}, 30_000);

function makeDB(rawDb) {
  return createDBEnv(rawDb);
}

function makeEnv(rawDb) {
  return {
    DB: makeDB(rawDb),
    ENVIRONMENT: "test",
    CSRF_SECRET: "test-csrf-secret",
  };
}

async function postLogin(env, { email, password }) {
  const request = new Request("https://example.test/api/admin/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "1.2.3.4",
      "User-Agent": "test-agent",
    },
    body: JSON.stringify({ email, password }),
  });
  return onRequestPost({ request, env });
}

function insertUser(
  rawDb,
  {
    email,
    hash,
    isActive = 1,
    activatedAt = "2025-01-01 00:00:00",
    role = "editor",
    totpEnabled = 0,
    totpSecret = null,
  } = {},
) {
  rawDb
    .prepare(
      `INSERT INTO users
         (email, password_hash, role, is_active, activated_at, name, first_name, last_name, totp_enabled, totp_secret)
       VALUES (?, ?, ?, ?, ?, 'Test User', 'Test', 'User', ?, ?)`,
    )
    .run(email, hash, role, isActive, activatedAt, totpEnabled, totpSecret);
}

// ── Item 1: password must be verified before account state is revealed ─────────

describe("login — account-enumeration guard (password-first ordering)", () => {
  test("wrong password for an unactivated account returns 401 WITHOUT requiresActivation", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "unactivated@test",
      hash: passwordHash,
      isActive: 0,
      activatedAt: null, // not yet activated
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, {
      email: "unactivated@test",
      password: WRONG_PASSWORD,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    // Must NOT reveal account state when password is wrong
    expect(body).not.toHaveProperty("requiresActivation");
    expect(body.error).toBe("Authentication failed");
  });

  test("correct password for an unactivated account returns 401 WITH requiresActivation:true", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "pending@test",
      hash: passwordHash,
      isActive: 0,
      activatedAt: null,
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, {
      email: "pending@test",
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    // Password was proven — safe to hint at activation requirement
    expect(body.requiresActivation).toBe(true);
    expect(body.error).toBe("Authentication failed");
  });

  test("correct password for a deactivated (admin-disabled) account returns 401 WITHOUT requiresActivation", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "deactivated@test",
      hash: passwordHash,
      isActive: 0,
      // activated_at is set (account was activated, then disabled)
      activatedAt: "2025-06-01 12:00:00",
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, {
      email: "deactivated@test",
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).not.toHaveProperty("requiresActivation");
    expect(body.error).toBe("Authentication failed");
  });

  test("wrong password for a deactivated account returns 401 WITHOUT requiresActivation", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "deactivated2@test",
      hash: passwordHash,
      isActive: 0,
      activatedAt: "2025-06-01 12:00:00",
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, {
      email: "deactivated2@test",
      password: WRONG_PASSWORD,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).not.toHaveProperty("requiresActivation");
  });

  test("non-existent email returns 401 without requiresActivation (user-not-found path unchanged)", async () => {
    const rawDb = createTestDB();
    const env = makeEnv(rawDb);
    const response = await postLogin(env, {
      email: "nobody@test",
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).not.toHaveProperty("requiresActivation");
    expect(body.error).toBe("Authentication failed");
  });
});

// ── Item 2: the MFA challenge branch (lines ~252-344) ───────────────────────

describe("login — MFA challenge branch", () => {
  test("issues the documented challenge shape and stores expires_at in SQLite datetime format", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "mfa-user@test",
      hash: passwordHash,
      totpEnabled: 1,
      totpSecret: "JBSWY3DPEHPK3PXP", // plaintext (unencrypted) secret is a supported input shape
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, { email: "mfa-user@test", password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      mfaRequired: true,
      mfaToken: expect.any(String),
      user: {
        email: "mfa-user@test",
        name: "Test User",
        firstName: "Test",
        lastName: "User",
        role: "editor",
      },
    });

    const challenge = rawDb.prepare("SELECT * FROM mfa_challenges WHERE token = ?").get(body.mfaToken);
    expect(challenge).toBeTruthy();
    expect(challenge.used).toBe(0);

    // The SEC-F1 bug class: a T-separated (ISO) expiry sorts differently than
    // SQLite's own datetime('now') in a plain TEXT comparison, which can let
    // an expired challenge pass a "still valid?" check. Pin the exact stored
    // shape, not just that SOME value is present.
    expect(challenge.expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(challenge.expires_at).not.toContain("T");
  });

  test("a missing TOTP secret produces a 500 MFA configuration error and creates no challenge row", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "mfa-missing-secret@test",
      hash: passwordHash,
      totpEnabled: 1,
      totpSecret: "",
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, { email: "mfa-missing-secret@test", password: TEST_PASSWORD });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("MFA configuration error");

    const challenges = rawDb.prepare("SELECT COUNT(*) as c FROM mfa_challenges").get();
    expect(challenges.c).toBe(0);
  });

  test("a corrupt encrypted TOTP secret produces a 500 MFA configuration error and creates no challenge row", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, {
      email: "mfa-corrupt-secret@test",
      hash: passwordHash,
      totpEnabled: 1,
      // "enc-v1:" prefix marks this as encrypted, but decryptTotpSecret()
      // requires TWO ":"-delimited segments after the prefix (iv + ciphertext)
      // and throws "Invalid encrypted TOTP secret format" when only one is present.
      totpSecret: "enc-v1:onlyonesegment",
    });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, { email: "mfa-corrupt-secret@test", password: TEST_PASSWORD });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("MFA configuration error");

    const challenges = rawDb.prepare("SELECT COUNT(*) as c FROM mfa_challenges").get();
    expect(challenges.c).toBe(0);
  });

  test("a non-MFA user creates no challenge row on login", async () => {
    const rawDb = createTestDB();
    insertUser(rawDb, { email: "plain-user@test", hash: passwordHash });

    const env = makeEnv(rawDb);
    const response = await postLogin(env, { email: "plain-user@test", password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mfaRequired).toBeUndefined();

    const challenges = rawDb.prepare("SELECT COUNT(*) as c FROM mfa_challenges").get();
    expect(challenges.c).toBe(0);
  });
});
