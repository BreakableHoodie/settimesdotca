-- Migration from Schema v1 to v2: Band Profile System
--
-- This migration separates band identity (reusable) from performances (event-specific)
--
-- BEFORE RUNNING: Backup your database!
--   wrangler d1 backup create longweekendbandcrawl --remote
--
-- Run with:
--   wrangler d1 execute longweekendbandcrawl --file=database/migration-v1-to-v2.sql --remote

-- ============================================================================
-- STEP 1: Create new tables (band_profiles and performances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS band_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  description TEXT,
  photo_url TEXT,
  genre TEXT,
  social_links TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS performances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  band_profile_id INTEGER NOT NULL,
  venue_id INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (band_profile_id) REFERENCES band_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_band_profiles_normalized ON band_profiles(name_normalized);
CREATE INDEX IF NOT EXISTS idx_band_profiles_genre ON band_profiles(genre);
CREATE INDEX IF NOT EXISTS idx_band_profiles_name ON band_profiles(name);
CREATE INDEX IF NOT EXISTS idx_performances_event ON performances(event_id);
CREATE INDEX IF NOT EXISTS idx_performances_band ON performances(band_profile_id);
CREATE INDEX IF NOT EXISTS idx_performances_venue ON performances(venue_id);
CREATE INDEX IF NOT EXISTS idx_performances_event_time ON performances(event_id, start_time);

-- Create trigger
CREATE TRIGGER IF NOT EXISTS update_band_profile_timestamp
AFTER UPDATE ON band_profiles
BEGIN
  UPDATE band_profiles SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================================
-- STEP 2: Extract unique bands from old bands table
-- ============================================================================
--
-- This uses a normalization function to deduplicate bands
-- Note: SQLite doesn't have user-defined functions, so we use LOWER and TRIM
--
-- Strategy:
-- 1. Group by normalized name (lowercase, trimmed)
-- 2. For each group, take the first URL found (prefer non-NULL)
-- 3. Create band profile

INSERT INTO band_profiles (name, name_normalized, social_links, created_at)
SELECT
  -- Take the name with most uppercase letters (likely the "correct" capitalization)
  (SELECT b2.name
   FROM bands b2
   WHERE LOWER(TRIM(b2.name)) = LOWER(TRIM(b1.name))
   ORDER BY LENGTH(b2.name) - LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
     b2.name,
     'A',''),'B',''),'C',''),'D',''),'E',''),'F',''),'G',''),'H',''),'I',''),'J','')) DESC
   LIMIT 1) as name,
  LOWER(TRIM(b1.name)) as name_normalized,
  -- Combine URLs into JSON social_links
  (SELECT '{"website":"' || b2.url || '"}'
   FROM bands b2
   WHERE LOWER(TRIM(b2.name)) = LOWER(TRIM(b1.name))
     AND b2.url IS NOT NULL
   LIMIT 1) as social_links,
  MIN(b1.created_at) as created_at
FROM bands b1
GROUP BY LOWER(TRIM(b1.name));

-- ============================================================================
-- STEP 3: Create performance records from old bands table
-- ============================================================================

INSERT INTO performances (event_id, band_profile_id, venue_id, start_time, end_time, created_at)
SELECT
  b.event_id,
  bp.id as band_profile_id,
  b.venue_id,
  b.start_time,
  b.end_time,
  b.created_at
FROM bands b
JOIN band_profiles bp ON LOWER(TRIM(b.name)) = bp.name_normalized;

-- ============================================================================
-- STEP 4: Verify migration (manual check)
-- ============================================================================
--
-- Run these queries to verify data integrity:
--
-- 1. Check band count matches:
--    SELECT 'Old bands' as source, COUNT(DISTINCT LOWER(TRIM(name))) as count FROM bands
--    UNION ALL
--    SELECT 'New profiles' as source, COUNT(*) as count FROM band_profiles;
--
-- 2. Check performance count matches:
--    SELECT 'Old bands' as source, COUNT(*) as count FROM bands
--    UNION ALL
--    SELECT 'New performances' as source, COUNT(*) as count FROM performances;
--
-- 3. Check for any unmigrated bands:
--    SELECT DISTINCT b.name
--    FROM bands b
--    LEFT JOIN band_profiles bp ON LOWER(TRIM(b.name)) = bp.name_normalized
--    WHERE bp.id IS NULL;

-- ============================================================================
-- STEP 5: Archive old bands table (don't drop yet - keep as backup)
-- ============================================================================

ALTER TABLE bands RENAME TO bands_deprecated_v1;

-- Drop old indexes (no longer needed)
DROP INDEX IF EXISTS idx_bands_event;
DROP INDEX IF EXISTS idx_bands_venue;
DROP INDEX IF EXISTS idx_bands_event_time;

-- ============================================================================
-- POST-MIGRATION TASKS
-- ============================================================================
--
-- 1. MANUAL: Review duplicate bands that were merged
--    Run this query to see which bands had variations:
--
--    SELECT name_normalized, COUNT(*) as variations
--    FROM bands_deprecated_v1
--    GROUP BY LOWER(TRIM(name))
--    HAVING variations > 1
--    ORDER BY variations DESC;
--
-- 2. MANUAL: Update API endpoints to use new schema
--    - GET /api/schedule should join performances with band_profiles
--    - POST /api/admin/bands should create/link to band_profiles
--
-- 3. MANUAL: Update frontend to use new data structure
--    - Schedule displays should show band profile data
--    - Admin panel should have band profile management
--
-- 4. AFTER VERIFICATION: Drop deprecated table
--    -- DROP TABLE bands_deprecated_v1;  -- Uncomment after confirming everything works

-- ============================================================================
-- ROLLBACK PLAN
-- ============================================================================
--
-- If migration fails or data is incorrect:
--
-- 1. Restore original bands table:
--    ALTER TABLE bands_deprecated_v1 RENAME TO bands;
--
-- 2. Drop new tables:
--    DROP TABLE performances;
--    DROP TABLE band_profiles;
--
-- 3. Recreate old indexes:
--    CREATE INDEX idx_bands_event ON bands(event_id);
--    CREATE INDEX idx_bands_venue ON bands(venue_id);
--    CREATE INDEX idx_bands_event_time ON bands(event_id, start_time);
