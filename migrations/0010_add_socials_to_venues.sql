-- Add website column to venues table
ALTER TABLE venues ADD COLUMN website TEXT;
ALTER TABLE venues ADD COLUMN instagram TEXT;
ALTER TABLE venues ADD COLUMN facebook TEXT;
ALTER TABLE venues ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
