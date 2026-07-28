-- Add page_views_daily table for tracking page views and event views
CREATE TABLE IF NOT EXISTS page_views_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  date TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  UNIQUE(page, date)
);

CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views_daily(date);
