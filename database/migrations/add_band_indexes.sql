-- Add indexes for band query performance optimization
-- Migration: add_band_indexes
-- Date: 2025-10-27

-- Index for duplicate name checking (case-insensitive)
-- Improves performance of: SELECT * FROM bands WHERE LOWER(name) = LOWER(?)
CREATE INDEX IF NOT EXISTS idx_bands_name_lower ON bands(LOWER(name));

-- Composite index for conflict detection
-- Improves performance of: SELECT * FROM bands WHERE event_id = ? AND venue_id = ?
CREATE INDEX IF NOT EXISTS idx_bands_event_venue_times ON bands(event_id, venue_id, start_time, end_time);

-- Index for event-specific queries
-- Improves performance of: SELECT * FROM bands WHERE event_id = ?
CREATE INDEX IF NOT EXISTS idx_bands_event_id ON bands(event_id);

-- Index for venue-specific queries
-- Improves performance of: SELECT * FROM bands WHERE venue_id = ?
CREATE INDEX IF NOT EXISTS idx_bands_venue_id ON bands(venue_id);
