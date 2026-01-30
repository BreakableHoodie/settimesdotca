-- SetTimes.ca - Consolidated Database Schema (Final)
-- Generated: December 3, 2025
-- Includes: v2 schema (band profiles), RBAC (users, audit), Invite Codes, Password Reset

-- ============================================================================
-- 1. CORE ENTITIES (Events, Venues, Bands)
-- ============================================================================

-- Users table (from migration-single-org.sql + rbac updates)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', -- 'admin', 'editor', 'viewer'
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- Events table (v2 + created_by)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_published INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  city TEXT,
  ticket_url TEXT,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

-- Venues table (v2 + created_by)
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  phone TEXT,
  contact_email TEXT,
  capacity INTEGER,
  website TEXT,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

-- Band profiles (v2 + created_by)
CREATE TABLE IF NOT EXISTS band_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  description TEXT,
  photo_url TEXT,
  genre TEXT,
  origin TEXT,
  origin_city TEXT,
  origin_region TEXT,
  contact_email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  social_links TEXT, -- JSON
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- Performances (v2 + created_by)
CREATE TABLE IF NOT EXISTS performances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  band_profile_id INTEGER NOT NULL,
  venue_id INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (band_profile_id) REFERENCES band_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

-- ============================================================================
-- 2. SECURITY & AUTH (Audit, Rate Limit, Invites)
-- ============================================================================

-- Auth audit table
CREATE TABLE IF NOT EXISTS auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  details TEXT
);

-- Rate limit table
CREATE TABLE IF NOT EXISTS rate_limit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lockout_until TEXT,
  last_attempt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log (Admin actions)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Invite codes
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  created_by_user_id INTEGER,
  used_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  ip_address TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 3. INDEXES & TRIGGERS
-- ============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_published ON events(is_published);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);

-- Band Profiles
CREATE UNIQUE INDEX IF NOT EXISTS idx_band_profiles_normalized ON band_profiles(name_normalized);
CREATE INDEX IF NOT EXISTS idx_band_profiles_genre ON band_profiles(genre);
CREATE INDEX IF NOT EXISTS idx_band_profiles_name ON band_profiles(name);

-- Performances
CREATE INDEX IF NOT EXISTS idx_performances_event ON performances(event_id);
CREATE INDEX IF NOT EXISTS idx_performances_band ON performances(band_profile_id);
CREATE INDEX IF NOT EXISTS idx_performances_venue ON performances(venue_id);
CREATE INDEX IF NOT EXISTS idx_performances_event_time ON performances(event_id, start_time);

-- Security
CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip ON auth_audit(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_band_profile_timestamp AFTER UPDATE ON band_profiles BEGIN UPDATE band_profiles SET updated_at = datetime('now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS update_events_timestamp AFTER UPDATE ON events BEGIN UPDATE events SET updated_at = datetime('now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS update_performances_timestamp AFTER UPDATE ON performances BEGIN UPDATE performances SET updated_at = datetime('now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS update_venues_timestamp AFTER UPDATE ON venues BEGIN UPDATE venues SET updated_at = datetime('now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS update_users_timestamp AFTER UPDATE ON users BEGIN UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id; END;
