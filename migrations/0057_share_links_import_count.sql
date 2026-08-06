-- Migration: 0057_share_links_import_count.sql
-- Adds an import counter to share_links for share-conversion metrics (#703).
--
-- Incremented (best-effort) by functions/api/schedule/share/[slug].js on the
-- `?import=1` refetch that App.jsx issues when a fan adopts a shared route.
-- That refetch deliberately does NOT increment view_count (it re-fetches a
-- snapshot already counted as a view by SharePreviewPage) -- see
-- 0040_share_links_view_count.sql. import_count is the conversion signal
-- view_count cannot provide: not just "was the link opened" but "did someone
-- adopt this route as their own". Existing rows default to 0.

ALTER TABLE share_links ADD COLUMN import_count INTEGER NOT NULL DEFAULT 0;
