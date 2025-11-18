-- Migration: Add band profile fields for Sprint 1.3
-- Date: 2025-11-15
-- Purpose: Add photo, bio, genre, origin, and social links to bands table

-- Add profile fields to bands table
ALTER TABLE bands ADD COLUMN photo_url TEXT;           -- R2 bucket URL or external URL
ALTER TABLE bands ADD COLUMN description TEXT;         -- Band bio/description
ALTER TABLE bands ADD COLUMN genre TEXT;               -- Music genre
ALTER TABLE bands ADD COLUMN origin TEXT;              -- City/region of origin
ALTER TABLE bands ADD COLUMN social_links TEXT;        -- JSON: {instagram, bandcamp, facebook, spotify, etc.}

-- Update existing bands to have empty/null values for new fields
-- (No UPDATE needed - SQLite defaults to NULL for new columns)
