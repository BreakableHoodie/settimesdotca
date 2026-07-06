-- Migration: 0051_add_performance_date_to_performances
-- Adds performance_date for multi-day event support (epic #543).
-- NULL means "inherit the event's single date" (every existing row) — so
-- single-day behavior is byte-identical. When set, it stores the FESTIVAL-DAY
-- calendar date the set belongs to (festival day boundary is 6 AM, per the
-- existing AFTER_MIDNIGHT_THRESHOLD_HOUR convention): a 1 AM set on the night of
-- day 1 stores day 1's date, with its 01:00 start understood as after-midnight.

ALTER TABLE performances ADD COLUMN performance_date TEXT;
