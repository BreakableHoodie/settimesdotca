-- Migration: 0023_add_metrics_tables.sql
-- Adds privacy-first artist metrics storage

CREATE TABLE IF NOT EXISTS artist_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_profile_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  page_views INTEGER DEFAULT 0,
  profile_clicks INTEGER DEFAULT 0,
  social_clicks INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(band_profile_id, date),
  FOREIGN KEY (band_profile_id) REFERENCES band_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artist_stats_date ON artist_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_artist_stats_band ON artist_daily_stats(band_profile_id);

ALTER TABLE band_profiles ADD COLUMN total_views INTEGER DEFAULT 0;
ALTER TABLE band_profiles ADD COLUMN total_social_clicks INTEGER DEFAULT 0;
ALTER TABLE band_profiles ADD COLUMN popularity_score REAL DEFAULT 0;
