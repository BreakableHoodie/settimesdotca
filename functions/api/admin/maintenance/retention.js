// Data retention cleanup — shared by the manual admin endpoint and scheduled job.
//
// Retention schedule (GDPR storage limitation principle):
//   lucia_sessions:  delete expired rows (no fixed age — expired = done)
//   mfa_challenges:  delete used or expired rows
//   email_otp_codes: delete expired rows
//   password_reset_tokens: delete used or expired rows
//   trusted_devices: delete expired rows
//   auth_attempts:   30 days  (rate-limit counters; contains IPs/emails)
//   auth_audit:      90 days  (short-lived security telemetry; contains IPs)
//   audit_log:       1 year   (admin action history; longer legitimate interest)
//                    EXCEPT action='api_key.request', at 90 days: that row is a
//                    REQUEST log wearing the audit-log schema — one per mutating
//                    key-authenticated request, written before the handler runs, so
//                    it records 403s and 404s too. At the 60/min ceiling a single key
//                    yields ~31.5M rows/year. The two predicates are deliberately
//                    disjoint (= vs !=) so they cannot double-count a row and the
//                    reported figures stay correct regardless of execution order.
//   rate_limits:     30 min (1800s) — stale fixed-window counters. The largest
//                    per-IP window is 300s so this is intentionally 6× to
//                    give a buffer against races. Uses unixepoch() because the
//                    column stores integer seconds, not ISO text.
//                    EXCEPT 'email-recipient:%' keys (#1337), which hold a 24 h
//                    per-address cap and are kept 25 h (90000s). At the 30 min
//                    rule they would vanish half an hour after the last email,
//                    and the cap would reset itself. The predicates are disjoint
//                    (LIKE vs NOT LIKE), in one statement.

import { RECIPIENT_KEY_PREFIX, RECIPIENT_KEY_RETENTION_SECONDS } from "../../../utils/recipientEmailCap.js";

export async function runRetentionCleanup(env) {
  const { DB } = env;
  const nowUnix = Math.floor(Date.now() / 1000);

  // Each delete is a thunk run inside its own promise, so a statement that
  // fails while being PREPARED (synchronously) is settled like one that fails
  // while running, instead of aborting the list before later tables start.
  const deletes = [
    ["lucia_sessions", () => DB.prepare("DELETE FROM lucia_sessions WHERE expires_at < ?").bind(nowUnix).run()],
    [
      "mfa_challenges",
      () => DB.prepare("DELETE FROM mfa_challenges WHERE used = 1 OR expires_at < datetime('now')").run(),
    ],
    ["email_otp_codes", () => DB.prepare("DELETE FROM email_otp_codes WHERE expires_at < datetime('now')").run()],
    [
      "password_reset_tokens",
      () =>
        DB.prepare("DELETE FROM password_reset_tokens WHERE used = 1 OR datetime(expires_at) < datetime('now')").run(),
    ],
    ["trusted_devices", () => DB.prepare("DELETE FROM trusted_devices WHERE expires_at <= datetime('now')").run()],
    [
      "auth_attempts",
      () => DB.prepare("DELETE FROM auth_attempts WHERE created_at < datetime('now', '-30 days')").run(),
    ],
    ["auth_audit", () => DB.prepare("DELETE FROM auth_audit WHERE timestamp < datetime('now', '-90 days')").run()],
    [
      "audit_log",
      () =>
        DB.prepare(
          "DELETE FROM audit_log WHERE action != 'api_key.request' AND created_at < datetime('now', '-1 year')",
        ).run(),
    ],
    [
      "audit_log",
      () =>
        DB.prepare(
          "DELETE FROM audit_log WHERE action = 'api_key.request' AND created_at < datetime('now', '-90 days')",
        ).run(),
    ],
    [
      "rate_limits",
      () =>
        DB.prepare(
          `DELETE FROM rate_limits
           WHERE (key NOT LIKE '${RECIPIENT_KEY_PREFIX}%' AND updated_at < unixepoch() - 1800)
              OR (key LIKE '${RECIPIENT_KEY_PREFIX}%' AND updated_at < unixepoch() - ${RECIPIENT_KEY_RETENTION_SECONDS})`,
        ).run(),
    ],
  ];
  const results = await Promise.allSettled(deletes.map(([, run]) => Promise.resolve().then(run)));
  const failedTables = [
    ...new Set(
      results.flatMap((result, index) => {
        if (result.status === "fulfilled") return [];
        const table = deletes[index][0];
        console.error("[Retention] Failed to delete %s", table, result.reason);
        return [table];
      }),
    ),
  ];
  if (failedTables.length) {
    throw new Error(`retention failed for: ${failedTables.join(", ")}`);
  }

  const [
    sessions,
    mfaChallenges,
    emailOtpCodes,
    passwordResetTokens,
    trustedDevices,
    authAttempts,
    authAudit,
    adminAudit,
    apiKeyRequests,
    rateLimits,
  ] = results.map((result) => result.value);

  return {
    sessions_deleted: sessions.meta.changes,
    mfa_challenges_deleted: mfaChallenges.meta.changes,
    email_otp_codes_deleted: emailOtpCodes.meta.changes,
    password_reset_tokens_deleted: passwordResetTokens.meta.changes,
    trusted_devices_deleted: trustedDevices.meta.changes,
    auth_attempts_deleted: authAttempts.meta.changes,
    auth_audit_deleted: authAudit.meta.changes,
    audit_log_deleted: adminAudit.meta.changes,
    api_key_requests_deleted: apiKeyRequests.meta.changes,
    rate_limits_deleted: rateLimits.meta.changes,
  };
}
