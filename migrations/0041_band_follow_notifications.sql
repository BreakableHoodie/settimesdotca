-- Migration: 0041_band_follow_notifications.sql
-- Per-follower announcement delivery tracking.
--
-- Why: band-announcement emails were fire-once with no retry path — if some
-- recipients failed, the per-performance band_follow_notified latch stayed set
-- and those fans were never notified. This table records which follower was
-- notified for which performance, so a resend can target only the un-notified
-- (guaranteeing eventual delivery, never double-sending).

CREATE TABLE IF NOT EXISTS band_follow_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  band_follow_id INTEGER NOT NULL REFERENCES band_follows(id) ON DELETE CASCADE,
  notified_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(performance_id, band_follow_id)
);

CREATE INDEX IF NOT EXISTS idx_band_follow_notifications_performance
  ON band_follow_notifications(performance_id);
