-- Add origin and genre columns to bands table
-- Migration: add_origin_genre_to_bands
-- Date: 2025-10-27

ALTER TABLE bands ADD COLUMN origin TEXT;
ALTER TABLE bands ADD COLUMN genre TEXT;
