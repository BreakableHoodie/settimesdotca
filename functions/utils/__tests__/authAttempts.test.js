import { beforeEach, describe, expect, it } from "vitest";
import { createDBEnv, createTestDB } from "../../api/test-utils.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, toSqliteDateTime, writeAuthAttempt } from "../authAttempts.js";

describe("authAttempts", () => {
  let rawDb;
  let DB;

  beforeEach(() => {
    rawDb = createTestDB();
    DB = createDBEnv(rawDb);
  });

  it("writes auth attempts with nullable fields", async () => {
    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfa,
      failureReason: "invalid_or_expired_token",
      ipAddress: "127.0.0.1",
      success: false,
      userAgent: "test-agent",
    });

    const row = rawDb.prepare("SELECT * FROM auth_attempts WHERE attempt_type = ?").get(AUTH_ATTEMPT_TYPES.mfa);

    expect(row.email).toBeNull();
    expect(row.user_id).toBeNull();
    expect(row.failure_reason).toBe("invalid_or_expired_token");
    expect(row.success).toBe(0);
  });

  it("blocks after five failed email-or-ip attempts", async () => {
    for (let index = 0; index < 5; index += 1) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email: "admin@test",
        failureReason: "invalid_password",
        ipAddress: "127.0.0.1",
        success: false,
        userAgent: "test-agent",
      });
    }

    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email: "admin@test",
      ipAddress: "127.0.0.1",
      scope: "email-or-ip",
    });

    expect(rateCheck.allowed).toBe(false);
    expect(rateCheck.remainingMinutes).toBeGreaterThan(0);
  });

  it("blocks after five failed ip-scoped attempts", async () => {
    for (let index = 0; index < 5; index += 1) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.mfa,
        failureReason: "invalid_or_expired_token",
        ipAddress: "127.0.0.1",
        success: false,
        userAgent: "test-agent",
      });
    }

    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfa,
      ipAddress: "127.0.0.1",
      scope: "ip",
    });

    expect(rateCheck.allowed).toBe(false);
    expect(rateCheck.remainingMinutes).toBeGreaterThan(0);
  });

  it("blocks after five failed email-scoped attempts", async () => {
    for (let index = 0; index < 5; index += 1) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email: "admin@test",
        failureReason: "invalid_password",
        ipAddress: "1.2.3.4",
        success: false,
        userAgent: "test-agent",
      });
    }

    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email: "admin@test",
      ipAddress: "1.2.3.4",
      scope: "email",
    });

    expect(rateCheck.allowed).toBe(false);
    expect(rateCheck.remainingMinutes).toBeGreaterThan(0);
  });

  it("does not block a different email after five failed email-scoped attempts", async () => {
    for (let index = 0; index < 5; index += 1) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email: "targeted@test",
        failureReason: "invalid_password",
        ipAddress: "1.2.3.4",
        success: false,
        userAgent: "test-agent",
      });
    }

    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email: "other@test",
      ipAddress: "1.2.3.4",
      scope: "email",
    });

    expect(rateCheck.allowed).toBe(true);
  });

  it("throws when scope is 'email' but email is null", async () => {
    await expect(
      checkAuthRateLimit(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email: null,
        ipAddress: "1.2.3.4",
        scope: "email",
      }),
    ).rejects.toThrow('checkAuthRateLimit: email is required for scope "email"');
  });

  it("scopes user-and-ip rate limits to the specific user and IP", async () => {
    for (let index = 0; index < 4; index += 1) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.mfaEnable,
        email: "admin@test",
        failureReason: "invalid_code",
        ipAddress: "127.0.0.1",
        success: false,
        userAgent: "test-agent",
        userId: 1,
      });
    }

    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfaEnable,
      email: "admin@test",
      failureReason: "invalid_code",
      ipAddress: "127.0.0.2",
      success: false,
      userAgent: "test-agent",
      userId: 1,
    });

    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfaEnable,
      ipAddress: "127.0.0.1",
      scope: "user-and-ip",
      userId: 1,
    });

    expect(rateCheck.allowed).toBe(true);
  });
});

describe("toSqliteDateTime", () => {
  it("formats a Date as SQLite's space-separated YYYY-MM-DD HH:MM:SS", () => {
    const result = toSqliteDateTime(new Date("2026-07-23T14:30:05.123Z"));

    expect(result).toBe("2026-07-23 14:30:05");
  });

  it("never produces the ISO 8601 T-separator or Z suffix that breaks D1 string comparisons", () => {
    const result = toSqliteDateTime(new Date("2026-07-23T14:30:05.123Z"));

    expect(result).not.toContain("T");
    expect(result).not.toContain("Z");
  });
});
