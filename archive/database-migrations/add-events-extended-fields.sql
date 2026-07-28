-- Migration: Add extended fields to events table
-- These columns were added directly to production without a migration file.
-- HISTORICAL RECORD — DO NOT RUN. These columns are already present in
-- production. The statements below are not valid SQLite as written (it has no
-- ADD COLUMN IF NOT EXISTS, and rejects a non-constant DEFAULT) and are kept
-- verbatim only to document what was applied. Archived from database/migrations/.

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_info TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS social_links TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_colors TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT (datetime('now'));
