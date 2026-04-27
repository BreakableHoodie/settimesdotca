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
//   rate_limits:     30 min (1800s) — stale fixed-window counters. The largest
//                    configured window is 300s so this is intentionally 6× to
//                    give a buffer against races. Uses unixepoch() because the
//                    column stores integer seconds, not ISO text.

export async function runRetentionCleanup(env) {
  const { DB } = env;
  const nowUnix = Math.floor(Date.now() / 1000);

  const [
    sessions,
    mfaChallenges,
    emailOtpCodes,
    passwordResetTokens,
    trustedDevices,
    authAttempts,
    authAudit,
    adminAudit,
    rateLimits,
  ] = await Promise.all([
    DB.prepare('DELETE FROM lucia_sessions WHERE expires_at < ?')
      .bind(nowUnix)
      .run(),
    DB.prepare(
      "DELETE FROM mfa_challenges WHERE used = 1 OR expires_at < datetime('now')"
    ).run(),
    DB.prepare(
      "DELETE FROM email_otp_codes WHERE expires_at < datetime('now')"
    ).run(),
    DB.prepare(
      "DELETE FROM password_reset_tokens WHERE used = 1 OR expires_at < datetime('now')"
    ).run(),
    DB.prepare(
      "DELETE FROM trusted_devices WHERE expires_at <= datetime('now')"
    ).run(),
    DB.prepare(
      "DELETE FROM auth_attempts WHERE created_at < datetime('now', '-30 days')"
    ).run(),
    DB.prepare(
      "DELETE FROM auth_audit WHERE timestamp < datetime('now', '-90 days')"
    ).run(),
    DB.prepare(
      "DELETE FROM audit_log WHERE created_at < datetime('now', '-1 year')"
    ).run(),
    DB.prepare(
      'DELETE FROM rate_limits WHERE updated_at < unixepoch() - 1800'
    ).run(),
  ]);

  return {
    sessions_deleted: sessions.meta.changes,
    mfa_challenges_deleted: mfaChallenges.meta.changes,
    email_otp_codes_deleted: emailOtpCodes.meta.changes,
    password_reset_tokens_deleted: passwordResetTokens.meta.changes,
    trusted_devices_deleted: trustedDevices.meta.changes,
    auth_attempts_deleted: authAttempts.meta.changes,
    auth_audit_deleted: authAudit.meta.changes,
    audit_log_deleted: adminAudit.meta.changes,
    rate_limits_deleted: rateLimits.meta.changes,
  };
}
