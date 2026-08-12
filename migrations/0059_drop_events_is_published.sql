-- Migration: 0059_drop_events_is_published.sql
-- Description: Drop the dead events.is_published column and its two indexes.
--
-- events.is_published was deprecated by migration 0005 in favour of `status`
-- but never dropped — 0036 even added a fresh index on it. On 2026-08-10,
-- archive.js's `status = 'archived', is_published = 0` write meant archiving
-- the last un-archived event zeroed the column for every event at once,
-- silently dropping 13 public read paths that still gated on
-- `is_published = 1` to zero rows (#800). #799 part 1 removed every
-- remaining read and write of the column. This migration removes the column
-- itself, now that nothing in production code references it.
--
-- SQLite refuses ALTER TABLE ... DROP COLUMN on an indexed column, so both
-- indexes must be dropped first:
--   idx_events_published      (0001, on is_published alone)
--   idx_events_published_date (0036, on (is_published, date))
--
-- idx_events_published_date was added because every public API query filters
-- by publish state and then orders/filters by date. `status` is that filter
-- now, so idx_events_status_date replaces it — without this replacement,
-- dropping the old index would be a silent performance regression on exactly
-- the public read paths restored in #800. idx_events_status (status alone,
-- from 0005) already exists and is left untouched.
--
-- D1 / modern SQLite supports ALTER TABLE … DROP COLUMN directly.

DROP INDEX IF EXISTS idx_events_published;
DROP INDEX IF EXISTS idx_events_published_date;

CREATE INDEX IF NOT EXISTS idx_events_status_date ON events (status, date);

ALTER TABLE events DROP COLUMN is_published;
