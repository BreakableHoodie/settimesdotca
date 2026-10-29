-- #1415: remove the dead pre-Lucia sessions table and hash confirmation tokens.
--
-- The old sessions table is no longer used; authentication is stored in
-- lucia_sessions. Its rows also contain IP addresses and user agents with no
-- current retention path, so remove the table and its indexes.
DROP INDEX IF EXISTS idx_sessions_user_id;
DROP INDEX IF EXISTS idx_sessions_expires;
DROP INDEX IF EXISTS idx_sessions_token;
DROP INDEX IF EXISTS idx_sessions_user;
DROP TABLE IF EXISTS sessions;

-- Confirmation tokens are bearer credentials. SQLite cannot compute SHA-256,
-- so existing plaintext values are retired rather than converted. New tokens
-- are stored as 'sha256:' || lowercase-hex SHA-256 and the plaintext remains
-- only in the emailed link. Retired values cannot equal a future digest.
UPDATE band_follows
SET verification_token = 'retired:' || id
WHERE verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%';

UPDATE band_follows
SET batch_token = 'retired:' || id
WHERE batch_token IS NOT NULL AND batch_token NOT LIKE 'sha256:%';

UPDATE email_subscriptions
SET verification_token = 'retired:' || id
WHERE verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%';
