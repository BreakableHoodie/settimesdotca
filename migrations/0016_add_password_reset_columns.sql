-- Backfill missing columns on older password_reset_tokens tables
ALTER TABLE password_reset_tokens ADD COLUMN created_by INTEGER;
ALTER TABLE password_reset_tokens ADD COLUMN used_at TEXT;
ALTER TABLE password_reset_tokens ADD COLUMN ip_address TEXT;
