-- Migration: Add extended fields to invite_codes table
-- These columns were added directly to production without a migration file.
-- Run: wrangler d1 execute settimes-db --remote --file=database/migrations/add-invite-codes-extended-fields.sql

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor';
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
