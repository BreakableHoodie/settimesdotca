-- Add social media fields to bands table
ALTER TABLE bands ADD COLUMN website TEXT;
ALTER TABLE bands ADD COLUMN instagram TEXT;
ALTER TABLE bands ADD COLUMN bandcamp TEXT;
ALTER TABLE bands ADD COLUMN facebook TEXT;

-- Add social media fields to venues table
ALTER TABLE venues ADD COLUMN website TEXT;
ALTER TABLE venues ADD COLUMN instagram TEXT;
ALTER TABLE venues ADD COLUMN facebook TEXT;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_bands_website ON bands(website);
CREATE INDEX IF NOT EXISTS idx_venues_website ON venues(website);

