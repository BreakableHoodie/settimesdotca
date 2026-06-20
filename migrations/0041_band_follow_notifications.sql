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

-- Backfill: seed notification rows for already-announced performances that were
-- notified under the old fire-once latch (band_follow_notified = 1). Without
-- this, the resend endpoint treats those followers as "not yet notified" and
-- re-emails all verified followers on the first resend, violating the
-- no-double-send guarantee for existing production data.
INSERT INTO band_follow_notifications (performance_id, band_follow_id)
SELECT p.id, bf.id
FROM performances p
JOIN band_follows bf ON bf.band_profile_id = p.band_profile_id
WHERE p.band_follow_notified = 1
  AND bf.verified = 1
  AND NOT EXISTS (
    SELECT 1 FROM band_follow_notifications bfn
    WHERE bfn.performance_id = p.id AND bfn.band_follow_id = bf.id
  );
