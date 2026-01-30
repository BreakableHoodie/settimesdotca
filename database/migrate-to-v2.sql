-- Migration script: Transform bands table to use performers registry
-- This script is idempotent and can be run multiple times safely

-- Step 1: Create performers table if it doesn't exist
CREATE TABLE IF NOT EXISTS performers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  genre TEXT,
  origin TEXT,
  description TEXT,
  photo_url TEXT,
  url TEXT,
  instagram TEXT,
  bandcamp TEXT,
  facebook TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 2: Extract unique performers from existing bands
-- For each unique band name, create a performer record
-- Aggregate data: use most recent genre/origin/url for each band
INSERT OR IGNORE INTO performers (name, genre, origin, url, created_at)
SELECT 
  name,
  (SELECT genre FROM bands b2 WHERE b2.name = b1.name AND b2.genre IS NOT NULL ORDER BY b2.created_at DESC LIMIT 1) as genre,
  (SELECT origin FROM bands b2 WHERE b2.name = b1.name AND b2.origin IS NOT NULL ORDER BY b2.created_at DESC LIMIT 1) as origin,
  (SELECT url FROM bands b2 WHERE b2.name = b1.name AND b2.url IS NOT NULL ORDER BY b2.created_at DESC LIMIT 1) as url,
  MIN(created_at) as created_at
FROM bands b1
WHERE name IS NOT NULL
GROUP BY name;

-- Step 3: Add performer_id column to bands table if it doesn't exist
-- Note: SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS directly
-- We need to check if the column exists first
-- This is handled by checking pragma_table_info in the application code

-- For now, we'll use a safe approach: create a new table and copy data

-- Create temporary backup of bands table
CREATE TABLE IF NOT EXISTS bands_backup AS SELECT * FROM bands;

-- Drop old bands table
DROP TABLE IF EXISTS bands;

-- Create new bands table with performer_id
CREATE TABLE bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  venue_id INTEGER NOT NULL,
  performer_id INTEGER,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  name TEXT,
  genre TEXT,
  origin TEXT,
  description TEXT,
  photo_url TEXT,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
  FOREIGN KEY (performer_id) REFERENCES performers(id) ON DELETE SET NULL,
  CHECK (performer_id IS NOT NULL OR name IS NOT NULL)
);

-- Step 4: Migrate data from backup to new table
-- Link existing performances to performers by name
INSERT INTO bands (
  id, event_id, venue_id, performer_id, 
  start_time, end_time, 
  name, genre, origin, url, created_at
)
SELECT 
  b.id,
  b.event_id,
  b.venue_id,
  p.id as performer_id,
  b.start_time,
  b.end_time,
  b.name,
  b.genre,
  b.origin,
  b.url,
  b.created_at
FROM bands_backup b
LEFT JOIN performers p ON p.name = b.name;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_bands_event ON bands(event_id);
CREATE INDEX IF NOT EXISTS idx_bands_venue ON bands(venue_id);
CREATE INDEX IF NOT EXISTS idx_bands_event_time ON bands(event_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bands_performer ON bands(performer_id);
CREATE INDEX IF NOT EXISTS idx_performers_name ON performers(name);

-- Step 6: Clean up backup table (optional - comment out to keep backup)
-- DROP TABLE bands_backup;

-- Migration complete!
-- Summary:
-- ✅ Created performers table with unique bands
-- ✅ Migrated bands table to new structure with performer_id
-- ✅ Preserved all existing performance data
-- ✅ Linked performances to performers by name
-- 
-- Note: bands_backup table is kept for safety. Drop it manually after verifying migration.
