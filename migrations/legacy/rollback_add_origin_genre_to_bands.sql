-- Rollback migration: remove origin and genre columns from bands table
-- Migration: rollback_add_origin_genre_to_bands
-- Date: 2025-10-27
-- WARNING: This will drop the origin and genre columns and lose all data in them

-- SQLite doesn't support DROP COLUMN directly (pre-3.35.0)
-- Must recreate table without the columns

BEGIN TRANSACTION;

-- Step 1: Create backup table with all columns except origin/genre
CREATE TABLE bands_backup AS
SELECT
  id,
  event_id,
  venue_id,
  name,
  start_time,
  end_time,
  url,
  description,
  photo_url,
  created_at
FROM bands;

-- Step 2: Drop original table
DROP TABLE bands;

-- Step 3: Recreate table without origin/genre
CREATE TABLE bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  venue_id INTEGER,
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  url TEXT,
  description TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

-- Step 4: Restore data from backup
INSERT INTO bands (id, event_id, venue_id, name, start_time, end_time, url, description, photo_url, created_at)
SELECT id, event_id, venue_id, name, start_time, end_time, url, description, photo_url, created_at
FROM bands_backup;

-- Step 5: Cleanup backup table
DROP TABLE bands_backup;

COMMIT;
