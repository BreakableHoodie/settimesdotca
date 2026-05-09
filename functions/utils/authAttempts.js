const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 5;

export const AUTH_ATTEMPT_TYPES = Object.freeze({
  login: "login",
  loginMfaChallenge: "login_mfa_challenge",
  signup: "signup",
  mfa: "mfa",
  mfaEnable: "mfa_enable",
  mfaDisable: "mfa_disable",
  mfaBackupCodes: "mfa_backup_codes",
});

function getRateLimitQuery(scope) {
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

function toSqliteDateTime(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function getRateLimitBindings(scope, { email, ipAddress, userId, attemptType, windowStart }) {
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

export async function checkAuthRateLimit(DB, {
  attemptType,
  email = null,
  ipAddress,
  maxFailures = DEFAULT_MAX_FAILURES,
  scope,
  userId = null,
  windowMs = DEFAULT_WINDOW_MS,
}) {
  const windowStart = toSqliteDateTime(new Date(Date.now() - windowMs));
  const query = getRateLimitQuery(scope);
  const bindings = getRateLimitBindings(scope, {
    email,
    ipAddress,
    userId,
    attemptType,
    windowStart,
  });

  const attempts = await DB.prepare(query)
    .bind(...bindings)
    .first();

  if (Number(attempts.count) >= maxFailures) {
    const earliestTs = attempts.earliest_attempt
      ? new Date(attempts.earliest_attempt.replace(' ', 'T') + 'Z').getTime()
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

export async function writeAuthAttempt(DB, {
  attemptType,
  email = null,
  failureReason = null,
  ipAddress = "unknown",
  success,
  userAgent = "unknown",
  userId = null,
}) {
  await DB.prepare(
    `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      userId,
      email,
      ipAddress,
      userAgent,
      attemptType,
      success ? 1 : 0,
      failureReason,
    )
    .run();
}