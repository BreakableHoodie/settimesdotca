-- Migration: 0039_add_page_views_daily.sql
-- Backfills the numbered migration sequence with page_views_daily.
--
-- Why: this table is written by functions/api/metrics.js (page_view + event_view
-- daily aggregation) and already exists in production and in
-- database/setup-complete.sql, but was never added to the numbered migrations/
-- sequence tracked in d1_migrations. That drift meant a database built purely from
-- numbered migrations (fresh dev/CI/replica) would lack the table, and the INSERT in
-- metrics.js is wrapped in a try/catch that silently no-ops when the table is absent
-- -- masking the loss. IF NOT EXISTS makes applying this to production a safe no-op.

CREATE TABLE IF NOT EXISTS page_views_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  date TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  UNIQUE(page, date)
);

CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views_daily(date);
