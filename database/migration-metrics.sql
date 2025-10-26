-- Migration: Add metrics tracking tables
-- Run after: migration-multi-org.sql

-- Schedule builds table: tracks when users build schedules
CREATE TABLE IF NOT EXISTS schedule_builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  band_id INTEGER NOT NULL,
  user_session TEXT NOT NULL,              -- Session identifier (no PII)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_builds_event ON schedule_builds(event_id);
CREATE INDEX IF NOT EXISTS idx_schedule_builds_session ON schedule_builds(user_session);
CREATE INDEX IF NOT EXISTS idx_schedule_builds_created ON schedule_builds(created_at);
