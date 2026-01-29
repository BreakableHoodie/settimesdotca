-- One-time migration: schedule_builds.band_id -> schedule_builds.performance_id
-- Run only if PRAGMA table_info(schedule_builds) shows band_id and no performance_id.
-- If performance_id already exists, do not run this file.

-- Check current columns
PRAGMA table_info(schedule_builds);

-- Migration (run the block below only if needed)
BEGIN TRANSACTION;

CREATE TABLE schedule_builds_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  performance_id INTEGER NOT NULL,
  user_session TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (performance_id) REFERENCES performances(id) ON DELETE CASCADE
);

INSERT INTO schedule_builds_new (id, event_id, performance_id, user_session, created_at)
SELECT id, event_id, band_id, user_session, created_at
FROM schedule_builds;

DROP TABLE schedule_builds;

ALTER TABLE schedule_builds_new RENAME TO schedule_builds;

CREATE INDEX IF NOT EXISTS idx_schedule_builds_event ON schedule_builds(event_id);
CREATE INDEX IF NOT EXISTS idx_schedule_builds_session ON schedule_builds(user_session);
CREATE INDEX IF NOT EXISTS idx_schedule_builds_created ON schedule_builds(created_at);

COMMIT;
