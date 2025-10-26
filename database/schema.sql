-- Long Weekend Band Crawl - D1 Database Schema
--
-- This schema supports multi-event management with venues and bands,
-- plus authentication audit logging and rate limiting for security.

-- Events table: stores each band crawl event
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- e.g., "Long Weekend Band Crawl Vol. 5"
  date TEXT NOT NULL,                    -- Event date in YYYY-MM-DD format
  slug TEXT NOT NULL UNIQUE,             -- URL-friendly identifier, e.g., "vol-5"
  is_published INTEGER NOT NULL DEFAULT 0, -- 0 = draft, 1 = published (visible to public)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Venues table: stores venue information
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,             -- Venue name, e.g., "Room 47"
  address TEXT                           -- Optional venue address
);

-- Bands table: stores performance schedule for each event
CREATE TABLE IF NOT EXISTS bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,                      -- FK to events table (nullable for orphaned bands)
  venue_id INTEGER NOT NULL,             -- FK to venues table
  name TEXT NOT NULL,                    -- Band name
  start_time TEXT NOT NULL,              -- Format: HH:MM (24-hour)
  end_time TEXT NOT NULL,                -- Format: HH:MM (24-hour)
  url TEXT,                              -- Optional URL to band info/social media
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

-- Auth audit table: logs all authentication attempts for security monitoring
CREATE TABLE IF NOT EXISTS auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,                  -- 'login_attempt', 'password_reset', etc.
  success INTEGER NOT NULL,              -- 0 = failed, 1 = successful
  ip_address TEXT NOT NULL,              -- Client IP for tracking
  user_agent TEXT,                       -- Optional browser/client info
  details TEXT                           -- Optional JSON with additional context
);

-- Rate limit table: tracks failed login attempts and lockouts
CREATE TABLE IF NOT EXISTS rate_limit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,       -- Client IP address
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lockout_until TEXT,                    -- ISO timestamp when lockout expires (NULL if not locked)
  last_attempt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance

-- Index for finding published events
CREATE INDEX IF NOT EXISTS idx_events_published ON events(is_published);

-- Index for finding events by slug (used in public API)
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);

-- Index for finding bands by event (most common query)
CREATE INDEX IF NOT EXISTS idx_bands_event ON bands(event_id);

-- Index for finding bands by venue (used for conflict detection)
CREATE INDEX IF NOT EXISTS idx_bands_venue ON bands(venue_id);

-- Composite index for finding bands by event and start time (for sorting)
CREATE INDEX IF NOT EXISTS idx_bands_event_time ON bands(event_id, start_time);

-- Index for auth audit queries (by timestamp and IP)
CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip ON auth_audit(ip_address);

-- Index for rate limit lookups (by IP address)
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit(ip_address);
