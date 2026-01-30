-- Complete Local Development Database Setup
-- Run this to initialize all tables needed for local development
-- Usage: sqlite3 <database-file> < database/setup-complete.sql

-- ============================================
-- CORE TABLES
-- ============================================

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_published INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  archived_at TEXT,
  description TEXT,
  city TEXT,
  ticket_url TEXT,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Venues table
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  capacity INTEGER,
  website TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bands table (with event_id for direct event association)
CREATE TABLE IF NOT EXISTS bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  venue_id INTEGER,
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  url TEXT,
  photo_url TEXT,
  description TEXT,
  genre TEXT,
  origin TEXT,
  social_links TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL
);

-- Performances table (for many-to-many relationships)
CREATE TABLE IF NOT EXISTS performances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  band_id INTEGER,
  band_name TEXT,
  venue_id INTEGER,
  start_time TEXT,
  end_time TEXT,
  stage TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL
);

-- Band profiles (persistent band info across events)
CREATE TABLE IF NOT EXISTS band_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_name TEXT NOT NULL UNIQUE,
  bio TEXT,
  genres TEXT,
  hometown TEXT,
  formed_year INTEGER,
  website TEXT,
  social_links TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- AUTH TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  activation_token TEXT,
  activation_token_expires_at TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  remember_me INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Auth attempts (for rate limiting)
CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  email TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  attempt_type TEXT NOT NULL,
  success INTEGER NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Invite codes
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER,
  used_by INTEGER,
  used_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 2FA TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
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

-- ============================================
-- AUDIT & SECURITY TABLES
-- ============================================

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

CREATE TABLE IF NOT EXISTS auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  details TEXT
);

CREATE TABLE IF NOT EXISTS rate_limit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lockout_until TEXT,
  last_attempt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_events_published ON events(is_published);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_bands_event ON bands(event_id);
CREATE INDEX IF NOT EXISTS idx_bands_venue ON bands(venue_id);
CREATE INDEX IF NOT EXISTS idx_performances_event ON performances(event_id);
CREATE INDEX IF NOT EXISTS idx_performances_venue ON performances(venue_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_activation_token ON users(activation_token);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip ON auth_audit(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit(ip_address);

-- ============================================
-- TEST ACCOUNTS (passwords set by scripts/setup-local-db.sh)
-- ============================================

INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active, activated_at) VALUES
(1, 'admin@settimes.ca', 'Admin', 'LMdE99cXULbK/0Sljsj5Ew==:URyOncHwAcdAfHWrHilKVm/wqh1990VFLF2esF7uFNM=', 'admin', 1, datetime('now')),
(2, 'editor@settimes.ca', 'Editor', '6xX0ohzMf1PumBFMY2Z+/w==:EKlNs262pgHEwd3JLrg0Q7fuUea+gNU+LxmXVsQPUZY=', 'editor', 1, datetime('now')),
(3, 'viewer@settimes.ca', 'Viewer', 'xVcJyrdL5oF4cB9J9iFxZA==:84JeF551+ZCfXsEb+g9d+btTs8hPxdiPZ7yunFbVfYM=', 'viewer', 1, datetime('now'));
