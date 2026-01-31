-- Auth Tables + Test Accounts (passwords set by scripts/setup-local-db.sh)
-- Complete schema for local development with all required columns

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

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  remember_me INTEGER DEFAULT 0,
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lucia_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  remember_me INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lucia_sessions_user_id ON lucia_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lucia_sessions_expires_at ON lucia_sessions(expires_at);

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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_activation_token ON users(activation_token);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip_address);

-- Band profiles (minimum fields for local dev)
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
  total_views INTEGER DEFAULT 0,
  total_social_clicks INTEGER DEFAULT 0,
  popularity_score REAL DEFAULT 0,
  social_links TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Artist daily stats (privacy-first, aggregated)
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_band_profiles_normalized ON band_profiles(name_normalized);
CREATE INDEX IF NOT EXISTS idx_band_profiles_genre ON band_profiles(genre);
CREATE INDEX IF NOT EXISTS idx_band_profiles_name ON band_profiles(name);
CREATE INDEX IF NOT EXISTS idx_artist_stats_date ON artist_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_artist_stats_band ON artist_daily_stats(band_profile_id);

-- Test accounts with base64-encoded PBKDF2-SHA256 hashes (100k iterations)
INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active, activated_at) VALUES
(1, 'admin@settimes.ca', 'Admin', 'LMdE99cXULbK/0Sljsj5Ew==:URyOncHwAcdAfHWrHilKVm/wqh1990VFLF2esF7uFNM=', 'admin', 1, datetime('now')),
(2, 'editor@settimes.ca', 'Editor', '6xX0ohzMf1PumBFMY2Z+/w==:EKlNs262pgHEwd3JLrg0Q7fuUea+gNU+LxmXVsQPUZY=', 'editor', 1, datetime('now')),
(3, 'viewer@settimes.ca', 'Viewer', 'xVcJyrdL5oF4cB9J9iFxZA==:84JeF551+ZCfXsEb+g9d+btTs8hPxdiPZ7yunFbVfYM=', 'viewer', 1, datetime('now'));
