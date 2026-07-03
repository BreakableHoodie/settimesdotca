-- Migration: 0050_restore_auth_audit
-- Description: Restore auth_audit to the migration history.
--   Migration 0001 created auth_audit; 0002 dropped it during the single-org
--   simplification, and no later migration recreated it — yet the table exists
--   in production (recreated out-of-band) and is written by live code
--   (functions/api/auth/reset-password-complete.js) and pruned by the retention
--   job (functions/api/admin/maintenance/retention.js). This migration makes the
--   migration history produce the table again so a from-scratch replay matches
--   production and database/setup-complete.sql (see #506).
--
--   No-op on production for the table itself (IF NOT EXISTS); the two indexes
--   from 0001 are (re)created — production currently lacks them.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

CREATE TABLE IF NOT EXISTS auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip ON auth_audit(ip_address);
