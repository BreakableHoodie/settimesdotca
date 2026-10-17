-- #1334: invite codes are stored hashed, like API keys.
--
-- GET /api/admin/invite-codes returned every unused code in plaintext, so an
-- admin session stolen without the second factor could read an unused admin
-- invite and sign up as a new admin. From here the plaintext exists only in the
-- creation response and the invite link. `code` now holds
-- 'sha256:' || lowercase-hex SHA-256 of the plaintext (functions/utils/
-- inviteCodes.js); `code_prefix` keeps the first 8 characters for display.
--
-- Dead rows (used, revoked, or expired) no longer need their plaintext, so they
-- are retired here: code_prefix is kept, and `code` becomes 'retired:<id>'
-- (still unique; it can never equal a SHA-256 digest of anything).
--
-- LIVE rows are deliberately left untouched. SQLite cannot compute SHA-256, so
-- they are converted by a one-off script after deploy. Until then a live
-- plaintext-valued row cannot be redeemed (signup hashes the submitted code),
-- which is accepted.
ALTER TABLE invite_codes ADD COLUMN code_prefix TEXT;

UPDATE invite_codes
SET code_prefix = substr(code, 1, 8),
    code = 'retired:' || id
WHERE NOT (used_by_user_id IS NULL AND is_active = 1 AND expires_at > datetime('now'));
