-- Migration: 0040_share_links_view_count.sql
-- Adds a view counter to share_links for share-virality metrics.
--
-- Incremented (best-effort) by functions/api/schedule/share/[slug].js on each
-- successful fetch of a shared route. Powers "most-viewed shared routes" and the
-- share segment of the engagement funnel. Existing rows default to 0.

ALTER TABLE share_links ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
