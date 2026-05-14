-- Migration: 0031_enforce_single_active_mfa_challenge
-- Description: Collapse duplicate active MFA challenges and enforce one active challenge per user.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

-- Mark older active MFA challenges as used so the unique partial index can be created safely.
UPDATE mfa_challenges
SET used = 1,
    used_at = COALESCE(used_at, datetime('now'))
WHERE id IN (
  SELECT older.id
  FROM mfa_challenges AS older
  JOIN mfa_challenges AS newer
    ON newer.user_id = older.user_id
   AND newer.used = 0
   AND older.used = 0
   AND (
     newer.created_at > older.created_at
     OR (newer.created_at = older.created_at AND newer.id > older.id)
   )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mfa_challenges_active_user
  ON mfa_challenges(user_id)
  WHERE used = 0;