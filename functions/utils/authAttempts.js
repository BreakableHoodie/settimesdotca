const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 5;

// Failed second-factor guesses are counted per USER, across these types, with
// no IP in the key: a stolen session that rotates addresses is still one user.
export const MFA_GUESS_LIMIT = Object.freeze({ maxFailures: 10, windowMs: 60 * 60 * 1000 });

export const AUTH_ATTEMPT_TYPES = Object.freeze({
  login: "login",
  loginMfaChallenge: "login_mfa_challenge",
  signup: "signup",
  mfa: "mfa",
  mfaEnable: "mfa_enable",
  mfaDisable: "mfa_disable",
  mfaBackupCodes: "mfa_backup_codes",
  mfaStepUp: "mfa_step_up",
  mfaReenrol: "mfa_reenrol",
});

export function mfaGuessAttemptTypes() {
  return [
    AUTH_ATTEMPT_TYPES.mfaStepUp,
    AUTH_ATTEMPT_TYPES.mfaBackupCodes,
    AUTH_ATTEMPT_TYPES.mfaDisable,
    AUTH_ATTEMPT_TYPES.mfaReenrol,
  ];
}

function getRateLimitQuery(scope, typeCount = 1) {
  // One user, any IP, across several attempt types (#1324). The per-IP scopes
  // are dodged by rotating addresses; this one is not.
  if (scope === "user") {
    return `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
      FROM auth_attempts
      WHERE user_id = ?
        AND attempt_type IN (${Array.from({ length: typeCount }, () => "?").join(", ")})
        AND success = 0
        AND created_at > ?`;
  }

  if (scope === "ip") {
    return `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
      FROM auth_attempts
      WHERE ip_address = ?
      AND attempt_type = ?
      AND success = 0
      AND created_at > ?`;
  }

  if (scope === "email") {
    return `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
      FROM auth_attempts
      WHERE email = ?
      AND attempt_type = ?
      AND success = 0
      AND created_at > ?`;
  }

  if (scope === "email-or-ip") {
    return `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
      FROM auth_attempts
      WHERE (email = ? OR ip_address = ?)
      AND attempt_type = ?
      AND success = 0
      AND created_at > ?`;
  }

  if (scope === "user-and-ip") {
    return `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
      FROM auth_attempts
      WHERE user_id = ?
        AND ip_address = ?
        AND attempt_type = ?
        AND success = 0
        AND created_at > ?`;
  }

  throw new Error(`Unsupported auth rate-limit scope: ${scope}`);
}

export function toSqliteDateTime(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

// Inverse of toSqliteDateTime(): parses either a space-separated SQLite
// datetime ("YYYY-MM-DD HH:MM:SS", implicitly UTC — no D1 value carries a
// timezone) or a legacy ISO-'T' value (which already carries its own 'Z'/
// offset) back into a real Date. A bare `new Date("YYYY-MM-DD HH:MM:SS")` is
// NOT valid ISO-8601 — JS engines fall back to LOCAL-time parsing for it,
// which is silently wrong on any non-UTC host (verified: a 4-hour drift on
// America/Toronto). Every "is this stored value already expired?" JS check
// against a toSqliteDateTime()-written column must go through this, not a
// raw `new Date(value)` (#670 follow-up — activate.js's real-time guard hit
// exactly this after the SEC-F1 write-side fix removed the 'Z' suffix).
// Returns null — never an Invalid Date — for absent or unparseable input.
// `Invalid Date < new Date()` evaluates to FALSE, so handing an Invalid Date to
// an "is this expired?" check silently reports "not expired" and fails OPEN.
// Callers must treat null as "cannot determine" and reject, not accept.
export function fromSqliteDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRateLimitBindings(scope, { email, ipAddress, userId, attemptType, attemptTypes, windowStart }) {
  if (scope === "user") {
    return [userId, ...(attemptTypes ?? [attemptType]), windowStart];
  }

  if (scope === "ip") {
    return [ipAddress, attemptType, windowStart];
  }

  if (scope === "email") {
    return [email, attemptType, windowStart];
  }

  if (scope === "email-or-ip") {
    return [email, ipAddress, attemptType, windowStart];
  }

  if (scope === "user-and-ip") {
    return [userId, ipAddress, attemptType, windowStart];
  }

  throw new Error(`Unsupported auth rate-limit scope: ${scope}`);
}

export async function checkAuthRateLimit(
  DB,
  {
    attemptType,
    attemptTypes = null,
    email = null,
    ipAddress,
    maxFailures = DEFAULT_MAX_FAILURES,
    scope,
    userId = null,
    windowMs = DEFAULT_WINDOW_MS,
  },
) {
  if (scope === "email" && !email) {
    throw new Error(`checkAuthRateLimit: email is required for scope "email"`);
  }

  const windowStart = toSqliteDateTime(new Date(Date.now() - windowMs));
  if (scope === "user" && (userId === null || userId === undefined)) {
    throw new Error(`checkAuthRateLimit: userId is required for scope "user"`);
  }
  const query = getRateLimitQuery(scope, attemptTypes?.length ?? 1);
  const bindings = getRateLimitBindings(scope, {
    email,
    ipAddress,
    userId,
    attemptType,
    attemptTypes,
    windowStart,
  });

  const attempts = await DB.prepare(query)
    .bind(...bindings)
    .first();

  if (Number(attempts.count) >= maxFailures) {
    const earliestTs = attempts.earliest_attempt
      ? new Date(attempts.earliest_attempt.replace(" ", "T") + "Z").getTime()
      : Date.now();
    const elapsed = Date.now() - earliestTs;
    const remainingMs = Math.max(0, windowMs - elapsed);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

    return {
      allowed: false,
      remainingMinutes,
    };
  }

  return { allowed: true };
}

export async function writeAuthAttempt(
  DB,
  {
    attemptType,
    email = null,
    failureReason = null,
    ipAddress = "unknown",
    success,
    userAgent = "unknown",
    userId = null,
  },
) {
  const result = await DB.prepare(
    `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, email, ipAddress, userAgent, attemptType, success ? 1 : 0, failureReason)
    .run();
  // The new row's id, so a caller that records an attempt BEFORE the check it
  // belongs to can settle it afterwards (see settleAuthAttempt).
  return result?.meta?.last_row_id ?? null;
}

// Settle a row written up front as a pending failure (#1324). A failed row is
// what the rate limiter counts, so recording it before the code is checked
// makes concurrent guesses count each other.
export async function settleAuthAttempt(DB, id, { success, failureReason = null }) {
  if (id === null || id === undefined) return;
  await DB.prepare("UPDATE auth_attempts SET success = ?, failure_reason = ? WHERE id = ?")
    .bind(success ? 1 : 0, success ? null : failureReason, id)
    .run();
}
