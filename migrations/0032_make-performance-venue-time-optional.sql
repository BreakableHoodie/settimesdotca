-- Migration: 0032_make-performance-venue-time-optional
-- Description: Make performances.venue_id, start_time, and end_time nullable so bands can
--   be added to a lineup before venue and schedule are confirmed (TBD lineup entries).
--   Also changes the venue FK from ON DELETE RESTRICT to ON DELETE SET NULL.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote
--
-- NOTE: SQLite does not support ALTER COLUMN, so we recreate the table.
-- This migration was applied to production on 2026-05-02.

PRAGMA foreign_keys = OFF;

CREATE TABLE performances_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  band_profile_id INTEGER NOT NULL,
  venue_id INTEGER,
  start_time TEXT,
  end_time TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (band_profile_id) REFERENCES band_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

INSERT INTO performances_new
  SELECT id, event_id, band_profile_id, venue_id, start_time, end_time,
         notes, created_at, created_by_user_id, updated_by_user_id, updated_at
  FROM performances;

DROP TABLE performances;
ALTER TABLE performances_new RENAME TO performances;

CREATE INDEX IF NOT EXISTS idx_performances_event ON performances(event_id);
CREATE INDEX IF NOT EXISTS idx_performances_band ON performances(band_profile_id);
CREATE INDEX IF NOT EXISTS idx_performances_venue ON performances(venue_id);
CREATE INDEX IF NOT EXISTS idx_performances_event_time ON performances(event_id, start_time);

PRAGMA foreign_keys = ON;
