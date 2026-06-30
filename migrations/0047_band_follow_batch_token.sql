-- Migration: 0047_band_follow_batch_token
-- Description: Add batch_token to band_follows to support batch follow confirmation.
--   A single shared batch_token ties the band_follows rows from one batch-follow
--   request together. Sending ONE confirmation email per submit (not per band)
--   mitigates amplification: one Turnstile solve → one email, regardless of how
--   many bands are in the batch. Non-unique so all rows in a batch can share the
--   same token; nullable so existing single-band follows (batch_token=NULL) are
--   unaffected. The per-row verification_token UNIQUE constraint is kept; it is
--   NULL for batch-confirmed rows after confirmation.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

ALTER TABLE band_follows ADD COLUMN batch_token TEXT;
CREATE INDEX IF NOT EXISTS idx_band_follows_batch_token ON band_follows(batch_token);
