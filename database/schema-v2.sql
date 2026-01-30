-- SetTimes - D1 Database Schema v2
--
-- BREAKING CHANGE: This replaces the bands table with a band profile system
-- that separates band identity (reusable) from performances (event-specific).
--
-- Migration: See migration.sql for upgrade path from v1

-- Events table: stores each music event (UNCHANGED)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- e.g., "Summer Music Festival 2025"
  date TEXT NOT NULL,                    -- Event date in YYYY-MM-DD format
  slug TEXT NOT NULL UNIQUE,             -- URL-friendly identifier, e.g., "vol-5"
  is_published INTEGER NOT NULL DEFAULT 0, -- 0 = draft, 1 = published (visible to public)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Venues table: stores venue information (UNCHANGED)
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,             -- Venue name, e.g., "Room 47"
  address TEXT,                          -- Optional venue address (legacy)
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  phone TEXT,
  contact_email TEXT
);

-- Band profiles: reusable band identity across all events
-- This is the "library" of bands that can be scheduled multiple times
CREATE TABLE IF NOT EXISTS band_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- Display name (preserves artistic capitalization)
  name_normalized TEXT NOT NULL UNIQUE,  -- Lowercase + trimmed for duplicate detection
  description TEXT,                      -- Band bio/description (markdown supported)
  photo_url TEXT,                        -- Hero image URL (uploaded or external)
  genre TEXT,                            -- Genre tags (comma-separated for MVP)
  origin TEXT,                           -- Legacy origin string
  origin_city TEXT,
  origin_region TEXT,
  contact_email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  social_links TEXT,                     -- JSON: {"bandcamp": "url", "instagram": "@handle", ...}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Performances: when/where a band played (replaces old bands table)
-- Links band profiles to events with scheduling details
CREATE TABLE IF NOT EXISTS performances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,             -- FK to events table
  band_profile_id INTEGER NOT NULL,      -- FK to band_profiles table
  venue_id INTEGER NOT NULL,             -- FK to venues table
  start_time TEXT NOT NULL,              -- Format: HH:MM (24-hour)
  end_time TEXT NOT NULL,                -- Format: HH:MM (24-hour)
  notes TEXT,                            -- Optional per-performance notes (e.g., "acoustic set")
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (band_profile_id) REFERENCES band_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

-- Auth audit table: logs all authentication attempts (UNCHANGED)
CREATE TABLE IF NOT EXISTS auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,                  -- 'login_attempt', 'password_reset', etc.
  success INTEGER NOT NULL,              -- 0 = failed, 1 = successful
  ip_address TEXT NOT NULL,              -- Client IP for tracking
  user_agent TEXT,                       -- Optional browser/client info
  details TEXT                           -- Optional JSON with additional context
);

-- Rate limit table: tracks failed login attempts and lockouts (UNCHANGED)
CREATE TABLE IF NOT EXISTS rate_limit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,       -- Client IP address
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lockout_until TEXT,                    -- ISO timestamp when lockout expires (NULL if not locked)
  last_attempt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Event indexes (UNCHANGED)
CREATE INDEX IF NOT EXISTS idx_events_published ON events(is_published);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);

-- Band profile indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_band_profiles_normalized ON band_profiles(name_normalized);
CREATE INDEX IF NOT EXISTS idx_band_profiles_genre ON band_profiles(genre);
CREATE INDEX IF NOT EXISTS idx_band_profiles_name ON band_profiles(name);

-- Performance indexes (replaces old band indexes)
CREATE INDEX IF NOT EXISTS idx_performances_event ON performances(event_id);
CREATE INDEX IF NOT EXISTS idx_performances_band ON performances(band_profile_id);
CREATE INDEX IF NOT EXISTS idx_performances_venue ON performances(venue_id);
CREATE INDEX IF NOT EXISTS idx_performances_event_time ON performances(event_id, start_time);

-- Auth indexes (UNCHANGED)
CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip ON auth_audit(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit(ip_address);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp on band profile changes
CREATE TRIGGER IF NOT EXISTS update_band_profile_timestamp
AFTER UPDATE ON band_profiles
BEGIN
  UPDATE band_profiles SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================================
-- NORMALIZATION RULES
-- ============================================================================
--
-- name_normalized field rules:
-- 1. Convert to lowercase: "The Harpoonist" → "the harpoonist"
-- 2. Trim whitespace: " Band Name " → "Band Name"
-- 3. Collapse multiple spaces: "The  Band" → "The Band"
--
-- JavaScript implementation:
--   const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');
--
-- This catches duplicates like:
--   "The Harpoonist" vs "THE HARPOONIST" vs "the harpoonist" vs "The  Harpoonist"
--
-- But preserves artistic choices:
--   "mxmtoon" stays "mxmtoon"
--   "CHVRCHES" stays "CHVRCHES"
--   "deadmau5" stays "deadmau5"
--
-- On duplicate detection:
-- - API returns 409 Conflict with existing band data
-- - Frontend shows: "Similar band found: [Name] (played Vol. 5, 3 performances)"
-- - User chooses: [Use This Band] or [Create Different Band]
-- - "Create Different Band" requires distinguishing detail (e.g., "mxmtoon (tribute)")
