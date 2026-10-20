-- Re-enrolment with proof of the current factor (#1318).
--
-- totp_pending_secret holds the encrypted secret of a NEW authenticator app
-- while totp_enabled = 1. It is written only by mfa/setup after the caller
-- proves the CURRENT factor, and it is promoted to totp_secret only by
-- mfa/enable once a code from the new app is confirmed. Nothing else reads it:
-- login, step-up, disable and backup-code regeneration verify against
-- totp_secret alone, so a pending secret can never authenticate anything.
-- Every path that clears or replaces the factor (disable, admin reset, a
-- first-time setup) sets it back to NULL.
ALTER TABLE users ADD COLUMN totp_pending_secret TEXT;

-- When totp_pending_secret was stored, in Unix seconds (as totp_last_step and
-- lucia_sessions.step_up_at are INTEGER). mfa/enable refuses a pending secret
-- older than its window, so an abandoned re-enrolment cannot be confirmed
-- later by whoever holds the session. Only meaningful while
-- totp_pending_secret is set; a stale value beside a NULL secret is inert.
ALTER TABLE users ADD COLUMN totp_pending_set_at INTEGER;
