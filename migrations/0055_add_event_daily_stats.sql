-- Migration: 0055_add_event_daily_stats.sql
-- Adds per-event daily aggregate storage for two allowlisted telemetry events
-- (functions/api/metrics.js ALLOWED_EVENTS) that were accepted, validated, and
-- rate-limited, but had no consumer and were silently dropped (#706):
--   - event_view: event-page traffic
--   - ticket_click: the site's highest-value conversion signal
--
-- Mirrors the artist_daily_stats pattern (0023_add_metrics_tables.sql) rather
-- than page_views_daily: page_views_daily is keyed by path, and mixing
-- event_id-keyed synthetic rows into it previously double-counted the same
-- view under two key formats (#445, see the comment in metrics.js). A
-- dedicated event_id-keyed table keeps this attribution clean.
--
-- Date values are the America/Toronto calendar day (eventLocalToday() from
-- functions/utils/eventDay.js), never a UTC slice — see CLAUDE.md "Server-side
-- 'today'/'now' is Toronto-local".

CREATE TABLE IF NOT EXISTS event_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  event_views INTEGER DEFAULT 0,
  ticket_clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(event_id, date),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_daily_stats_date ON event_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_event_daily_stats_event ON event_daily_stats(event_id);
