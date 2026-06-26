-- Migration: 0046_band_announce_queue
-- Description: Digest queue for band-lineup announcements.
--   When a band is announced, verified followers are queued here instead of
--   emailed immediately. POST /api/admin/flush-announce-digest groups pending
--   entries by (email, event) and sends one digest per fan per event — so a
--   fan following 5 bands on one bill gets a single "5 bands you follow are
--   playing X" email rather than 5 separate ones.
--
--   band_follow_notifications remains the idempotency ledger: a row is
--   inserted (claimed) just before each email send, and released on failure,
--   so the resend-announcement endpoint can still recover missed deliveries.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

CREATE TABLE band_announce_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_follow_id INTEGER NOT NULL REFERENCES band_follows(id) ON DELETE CASCADE,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL,
  band_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_slug TEXT NOT NULL,
  band_profile_id INTEGER NOT NULL,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(band_follow_id, performance_id)
);

CREATE INDEX IF NOT EXISTS idx_band_announce_queue_event ON band_announce_queue(event_id);
CREATE INDEX IF NOT EXISTS idx_band_announce_queue_follow ON band_announce_queue(band_follow_id);
