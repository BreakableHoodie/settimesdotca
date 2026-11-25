-- #1488: session ids and MFA challenge tokens are stored hashed, like invite
-- codes (0071), password reset tokens (0074) and activation tokens (0083).
--
-- lucia_sessions.id and mfa_challenges.token held the raw bearer value, so
-- anyone who could read D1 could replay a live session. From here both hold
-- 'sha256:' || lowercase-hex SHA-256 of the value (functions/utils/tokens.js
-- hashStoredToken); the cookie and the login response carry the raw value, and
-- every lookup hashes what is submitted first.
--
-- Existing rows cannot be converted (SQLite cannot compute SHA-256), so every
-- session and pending MFA challenge is deleted: everyone signs in again (owner
-- decision, 2026-11-25, off-season). No table references either one.
DELETE FROM mfa_challenges;
DELETE FROM lucia_sessions;

-- Refuse an unhashed value at the database, as 0069 does for roles. Triggers,
-- not a CHECK: a CHECK needs a table rebuild. GLOB is case-sensitive and the
-- length pins 'sha256:' + 64 hex characters (LIKE would accept 'SHA256:x'). The token UPDATE trigger covers
-- login's ON CONFLICT ... DO UPDATE SET token = excluded.token.
CREATE TRIGGER IF NOT EXISTS lucia_sessions_id_hashed_insert
BEFORE INSERT ON lucia_sessions
WHEN NOT (NEW.id GLOB 'sha256:*' AND length(NEW.id) = 71)
BEGIN
  SELECT RAISE(ABORT, 'lucia_sessions.id must be a sha256: digest');
END;

CREATE TRIGGER IF NOT EXISTS lucia_sessions_id_hashed_update
BEFORE UPDATE OF id ON lucia_sessions
WHEN NOT (NEW.id GLOB 'sha256:*' AND length(NEW.id) = 71)
BEGIN
  SELECT RAISE(ABORT, 'lucia_sessions.id must be a sha256: digest');
END;

CREATE TRIGGER IF NOT EXISTS mfa_challenges_token_hashed_insert
BEFORE INSERT ON mfa_challenges
WHEN NOT (NEW.token GLOB 'sha256:*' AND length(NEW.token) = 71)
BEGIN
  SELECT RAISE(ABORT, 'mfa_challenges.token must be a sha256: digest');
END;

CREATE TRIGGER IF NOT EXISTS mfa_challenges_token_hashed_update
BEFORE UPDATE OF token ON mfa_challenges
WHEN NOT (NEW.token GLOB 'sha256:*' AND length(NEW.token) = 71)
BEGIN
  SELECT RAISE(ABORT, 'mfa_challenges.token must be a sha256: digest');
END;
