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
  } = {},
) {
  rawDb
    .prepare(
      `INSERT INTO users
         (email, password_hash, role, is_active, activated_at, name, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, 'Test User', 'Test', 'User')`,
    )
    .run(email, hash, role, isActive, activatedAt);
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
