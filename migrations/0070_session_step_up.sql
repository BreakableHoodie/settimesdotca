-- Step-up re-authentication (#1324).
--
-- step_up_at is the Unix time (seconds, like this table's expires_at) at which
-- the session's owner last re-proved their second factor. NULL means never.
-- Sensitive identity changes require it to be recent (functions/utils/stepUp.js).
-- Every session starts NULL: login, 2FA enrolment and revoke-all all INSERT a
-- fresh row, so a new session never inherits a step-up.
ALTER TABLE lucia_sessions ADD COLUMN step_up_at INTEGER;
