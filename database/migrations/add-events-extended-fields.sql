-- Migration: Add extended fields to events table
-- These columns were added directly to production without a migration file.
-- Run: wrangler d1 execute settimes-db --remote --file=database/migrations/add-events-extended-fields.sql

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_info TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS social_links TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_colors TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT (datetime('now'));
