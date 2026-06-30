-- Migration: 0048_drop_dead_artist_daily_stats_columns.sql
-- Description: Drop profile_clicks and share_count from artist_daily_stats.
--
-- profile_clicks: no event in the metrics allowlist ever writes it; always 0 in prod.
--
-- share_count: referenced by the aggregate-stats popularity formula
--   (page_views*1 + social_clicks*3 + share_count*5) but never written, so the 5×
--   weight was silently inert. The column is dropped and the formula updated to
--   page_views*1 + social_clicks*3. Share-link counts (from share_links.view_count)
--   as a popularity signal is tracked as a deferred enhancement.
--
-- D1 / modern SQLite supports ALTER TABLE … DROP COLUMN directly.

ALTER TABLE artist_daily_stats DROP COLUMN profile_clicks;
ALTER TABLE artist_daily_stats DROP COLUMN share_count;
