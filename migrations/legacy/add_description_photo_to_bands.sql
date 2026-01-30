-- Add description and photo_url columns to bands table
-- Migration: add_description_photo_to_bands
-- Date: 2025-10-27

ALTER TABLE bands ADD COLUMN description TEXT;
ALTER TABLE bands ADD COLUMN photo_url TEXT;
