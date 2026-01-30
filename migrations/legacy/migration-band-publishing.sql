-- Add publishing control to bands table
-- Allows selective announcement of performers

ALTER TABLE bands ADD COLUMN is_published INTEGER DEFAULT 1 NOT NULL;

-- Create index for efficient published band queries
CREATE INDEX IF NOT EXISTS idx_bands_published ON bands(is_published, event_id);

-- Update existing bands to be published
UPDATE bands SET is_published = 1 WHERE is_published IS NULL;
