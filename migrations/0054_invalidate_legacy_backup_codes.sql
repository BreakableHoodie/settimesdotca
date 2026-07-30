-- Migration: 0054_invalidate_legacy_backup_codes
-- Description: #675 — MFA backup code hashing changed from unsalted
-- single-round SHA-256 over a 6-char (~2^31 entropy) code to a per-code-salted
-- SHA-256 over a 10-char (~2^51 entropy) code (functions/utils/totp.js). The
-- new hash format ("sha256$salt$hash") can never match the old bare-digest
-- format by construction, so every backup code issued before this deploy is
-- already unusable. This migration makes that explicit in the data instead of
-- leaving stale, silently-dead hashes sitting in `backup_codes` — without it,
-- GET /api/admin/mfa/status would keep reporting hasBackupCodes: true for a
-- set that can never verify again.
--
-- TOTP (`totp_secret`, `totp_enabled`) is untouched — admins with MFA enabled
-- keep signing in with their authenticator app; only the backup recovery
-- codes are cleared. Anyone who relies on backup codes should regenerate via
-- Settings -> MFA -> Regenerate Backup Codes (POST /api/admin/mfa/backup-codes),
-- which only requires a live TOTP code and returns a fresh salted 10-char set.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

UPDATE users
SET backup_codes = NULL
WHERE backup_codes IS NOT NULL;
