-- Migration: 0035_band_follows
-- Description: New band_follows table (token-based email follows for individual bands)
--   and band_follow_notified column on performances to prevent duplicate notifications
--   when a band is announced multiple times.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

CREATE TABLE band_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  band_profile_id INTEGER NOT NULL REFERENCES band_profiles(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT UNIQUE,
  unsubscribe_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email, band_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_band_follows_band ON band_follows(band_profile_id);
CREATE INDEX IF NOT EXISTS idx_band_follows_email ON band_follows(email);

ALTER TABLE performances ADD COLUMN band_follow_notified INTEGER NOT NULL DEFAULT 0;
