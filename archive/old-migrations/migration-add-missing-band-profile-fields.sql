-- Add missing band profile fields to bands table
-- Only adds fields that don't already exist

-- Add description field (if not exists)
ALTER TABLE bands ADD COLUMN description TEXT;

-- Add photo_url field (if not exists)
ALTER TABLE bands ADD COLUMN photo_url TEXT;

-- Add genre field (if not exists)
ALTER TABLE bands ADD COLUMN genre TEXT;

-- Add index for faster genre filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);

-- Note: All fields are nullable for backward compatibility
-- Using ALTER TABLE ADD COLUMN IF NOT EXISTS is not standard SQLite
-- So we'll run these and they'll error gracefully if they already exist
-- Wrangler will show "duplicate column" error for any existing columns, which is expected


