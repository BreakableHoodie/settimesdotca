-- Migration: Allow NULL event_id for orphaned bands and use SET NULL on delete
-- This allows event deletion while preserving bands for reuse
-- Created: 2025-01-27

-- First, we need to recreate the bands table with nullable event_id and SET NULL constraint
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table

-- Step 1: Create a backup of the bands table
CREATE TABLE bands_backup AS SELECT * FROM bands;

-- Step 2: Drop the original bands table
DROP TABLE bands;

-- Step 3: Recreate bands table with nullable event_id and venue_id and SET NULL constraint
CREATE TABLE bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,                      -- FK to events table (nullable for orphaned bands)
  venue_id INTEGER,                      -- FK to venues table (nullable for rolodex bands)
  name TEXT NOT NULL,                    -- Band name
  start_time TEXT,                       -- Format: HH:MM (24-hour) - nullable for rolodex bands
  end_time TEXT,                         -- Format: HH:MM (24-hour) - nullable for rolodex bands
  url TEXT,                              -- Optional URL to band info/social media
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

-- Step 4: Restore data from backup
INSERT INTO bands SELECT * FROM bands_backup;

-- Step 5: Drop the backup table
DROP TABLE bands_backup;

-- Step 6: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_bands_event ON bands(event_id);
CREATE INDEX IF NOT EXISTS idx_bands_venue ON bands(venue_id);
CREATE INDEX IF NOT EXISTS idx_bands_event_time ON bands(event_id, start_time);
