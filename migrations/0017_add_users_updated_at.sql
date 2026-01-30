-- Add updated_at column to users (for admin listings)
ALTER TABLE users
ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
