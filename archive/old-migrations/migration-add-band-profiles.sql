-- Add band profile fields to bands table
-- This adds richer profile data for bands including description, photo, genre, and origin

-- Step 1: Backup existing data
CREATE TABLE bands_backup AS SELECT * FROM bands;

-- Step 2: Add new profile fields to bands table
ALTER TABLE bands ADD COLUMN description TEXT;           -- Band bio/description
ALTER TABLE bands ADD COLUMN photo_url TEXT;              -- Band photo/image URL
ALTER TABLE bands ADD COLUMN genre TEXT;                  -- Genre tags (comma-separated)
ALTER TABLE bands ADD COLUMN origin TEXT;                 -- Where the band is from (city, region, etc.)

-- Step 3: Add index for faster genre filtering
CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);
CREATE INDEX IF NOT EXISTS idx_bands_origin ON bands(origin);

-- Step 4: Restore data from backup
DROP TABLE bands_backup;

-- Note: All new fields are nullable to maintain backward compatibility
-- Existing bands will continue to work without these fields


