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

-- Confirmation tokens are bearer credentials. From here they are stored as
-- 'sha256:' || lowercase-hex SHA-256 (functions/utils/tokens.js
-- hashStoredToken) and the plaintext exists only in the emailed link. SQLite
-- cannot compute SHA-256, so existing plaintext values cannot be converted.
--
-- Pending (unconfirmed) rows are DELETED, not retired. A retired pending follow
-- would still count as a live request: follow.js and follow-batch.js would
-- answer a re-request with INSERT OR IGNORE, change nothing and send nothing,
-- leaving the fan unable to confirm for up to 7 days. Deleted, the next request
-- creates a fresh row and a fresh email. Pending requests expire in 7 days
-- anyway, and production held none when this was written (2026-10-28).
--
-- Children first, explicitly: whether D1 enforces ON DELETE CASCADE depends on
-- the context, so this does not rely on it. A pending row should have none.
DELETE FROM band_follow_notifications WHERE band_follow_id IN (
  SELECT id FROM band_follows WHERE verified = 0
    AND (
      (verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%')
      OR (batch_token IS NOT NULL AND batch_token NOT LIKE 'sha256:%')
    )
);
DELETE FROM band_announce_queue WHERE band_follow_id IN (
  SELECT id FROM band_follows WHERE verified = 0
    AND (
      (verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%')
      OR (batch_token IS NOT NULL AND batch_token NOT LIKE 'sha256:%')
    )
);
DELETE FROM subscription_verifications WHERE subscription_id IN (
  SELECT id FROM email_subscriptions WHERE verified = 0
    AND verification_token IS NOT NULL
    AND verification_token NOT LIKE 'sha256:%'
);
DELETE FROM subscription_unsubscribes WHERE subscription_id IN (
  SELECT id FROM email_subscriptions WHERE verified = 0
    AND verification_token IS NOT NULL
    AND verification_token NOT LIKE 'sha256:%'
);
DELETE FROM subscription_notifications WHERE subscription_id IN (
  SELECT id FROM email_subscriptions WHERE verified = 0
    AND verification_token IS NOT NULL
    AND verification_token NOT LIKE 'sha256:%'
);

DELETE FROM band_follows
WHERE verified = 0
  AND (
    (verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%')
    OR (batch_token IS NOT NULL AND batch_token NOT LIKE 'sha256:%')
  );

DELETE FROM email_subscriptions
WHERE verified = 0
  AND verification_token IS NOT NULL
  AND verification_token NOT LIKE 'sha256:%';

-- A confirmed row keeps no usable token: confirmation NULLs the follow tokens,
-- but email_subscriptions keeps its token after verifying. Retire whatever
-- plaintext is left to 'retired:<id>' (still unique; never equal to a digest).
UPDATE band_follows
SET verification_token = 'retired:' || id
WHERE verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%';

UPDATE band_follows
SET batch_token = 'retired:' || id
WHERE batch_token IS NOT NULL AND batch_token NOT LIKE 'sha256:%';

UPDATE email_subscriptions
SET verification_token = 'retired:' || id
WHERE verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%';
