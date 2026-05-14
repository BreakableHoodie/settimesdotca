-- Migration: 0034_reveal_mode
-- Description: Add reveal_mode to events (when true, only announced performances
--   appear on the public schedule) and is_announced to performances (toggle per band).
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote
--
-- Safe defaults: reveal_mode=0 means existing events show all bands (no change).
--   is_announced=1 means existing performances are visible by default.

ALTER TABLE events ADD COLUMN reveal_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE performances ADD COLUMN is_announced INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_performances_announced
  ON performances(event_id, is_announced);
