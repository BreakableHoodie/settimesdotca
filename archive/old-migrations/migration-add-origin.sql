-- Add Origin field to bands table
-- Origin represents where the band/artist is from (city, region, etc.)

ALTER TABLE bands ADD COLUMN origin TEXT;

-- Index for filtering/sorting by origin
CREATE INDEX IF NOT EXISTS idx_bands_origin ON bands(origin);

