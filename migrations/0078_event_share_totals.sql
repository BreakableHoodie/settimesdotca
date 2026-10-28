-- Migration: 0078_event_share_totals.sql
-- Preserve aggregate share history after the expiring route rows and their
-- visitor ledger are deleted. No route or visitor-level detail is retained.

CREATE TABLE IF NOT EXISTS event_share_totals (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  views_legacy INTEGER NOT NULL DEFAULT 0 CHECK (views_legacy >= 0),
  imports INTEGER NOT NULL DEFAULT 0 CHECK (imports >= 0)
);
