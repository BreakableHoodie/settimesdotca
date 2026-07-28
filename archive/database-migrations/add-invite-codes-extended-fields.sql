-- Migration: Add extended fields to invite_codes table
-- These columns were added directly to production without a migration file.
-- HISTORICAL RECORD — DO NOT RUN. These columns are already present in
-- production. The statements below are not valid SQLite as written (it has no
-- ADD COLUMN IF NOT EXISTS) and are kept verbatim only to document what was
-- applied. Archived from database/migrations/.

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor';
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
