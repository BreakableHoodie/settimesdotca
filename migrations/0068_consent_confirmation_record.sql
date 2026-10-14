-- Migration: 0068_consent_confirmation_record
-- Description: Record when and under which wording a double opt-in was confirmed.
--   confirmed_at: SQLite timestamp of the confirmation click (null = not recorded)
--   consent_version: wording version shown at request time (null = legacy row)
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

ALTER TABLE band_follows ADD COLUMN confirmed_at TEXT;
ALTER TABLE band_follows ADD COLUMN consent_version TEXT;

ALTER TABLE email_subscriptions ADD COLUMN confirmed_at TEXT;
ALTER TABLE email_subscriptions ADD COLUMN consent_version TEXT;
