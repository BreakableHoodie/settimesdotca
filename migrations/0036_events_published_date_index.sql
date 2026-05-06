-- Composite index on (is_published, date) for public event queries
-- Every public API query filters by is_published = 1 and orders/filters by date.
-- This lets SQLite satisfy the filter and sort with a single index scan.
CREATE INDEX IF NOT EXISTS idx_events_published_date ON events (is_published, date);
