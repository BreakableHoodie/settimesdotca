-- Rollback migration: remove description and photo_url columns from bands table
-- Migration: rollback_add_description_photo_to_bands
-- Date: 2025-10-27
-- WARNING: This will drop the description and photo_url columns and lose all data in them

-- SQLite doesn't support DROP COLUMN directly (pre-3.35.0)
-- Must recreate table without the columns

BEGIN TRANSACTION;

-- Step 1: Create backup table with all columns except description/photo_url
CREATE TABLE bands_backup AS
SELECT
  id,
  event_id,
  venue_id,
  name,
  start_time,
  end_time,
  url,
  origin,
  genre,
  created_at
FROM bands;

-- Step 2: Drop original table
DROP TABLE bands;

-- Step 3: Recreate table without description/photo_url
CREATE TABLE bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  venue_id INTEGER,
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  url TEXT,
  origin TEXT,
  genre TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

-- Step 4: Restore data from backup
INSERT INTO bands (id, event_id, venue_id, name, start_time, end_time, url, origin, genre, created_at)
SELECT id, event_id, venue_id, name, start_time, end_time, url, origin, genre, created_at
FROM bands_backup;

-- Step 5: Cleanup backup table
DROP TABLE bands_backup;

COMMIT;
