// Data retention cleanup — shared by the manual admin endpoint and scheduled job.
//
// Retention schedule (GDPR storage limitation principle):
//   lucia_sessions:  delete expired rows (no fixed age — expired = done)
//   auth_attempts:   30 days  (rate-limit counters; contains IPs/emails)
//   auth_audit:      90 days  (short-lived security telemetry; contains IPs)
//   audit_log:       1 year   (admin action history; longer legitimate interest)
//   rate_limits:     2× max window (30 min) — stale fixed-window counters; uses
//                    unixepoch() because the column stores integer seconds

export async function runRetentionCleanup(env) {
  const { DB } = env;
  const nowUnix = Math.floor(Date.now() / 1000);

  const [sessions, authAttempts, authAudit, adminAudit, rateLimits] = await Promise.all([
    DB.prepare("DELETE FROM lucia_sessions WHERE expires_at < ?")
      .bind(nowUnix)
      .run(),
    DB.prepare("DELETE FROM auth_attempts WHERE created_at < datetime('now', '-30 days')")
      .run(),
    DB.prepare("DELETE FROM auth_audit WHERE timestamp < datetime('now', '-90 days')")
      .run(),
    DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-1 year')")
      .run(),
    DB.prepare("DELETE FROM rate_limits WHERE updated_at < unixepoch() - 1800")
      .run(),
  ]);

  return {
    sessions_deleted: sessions.meta.changes,
    auth_attempts_deleted: authAttempts.meta.changes,
    auth_audit_deleted: authAudit.meta.changes,
    audit_log_deleted: adminAudit.meta.changes,
    rate_limits_deleted: rateLimits.meta.changes,
  };
}
