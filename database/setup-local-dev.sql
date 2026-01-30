-- Auth Tables + Test Accounts (passwords set by scripts/setup-local-db.sh)
-- Complete schema for local development with all required columns

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
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
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip_address);

-- Test accounts with base64-encoded PBKDF2-SHA256 hashes (100k iterations)
INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active) VALUES
(1, 'admin@settimes.ca', 'Admin', 'LMdE99cXULbK/0Sljsj5Ew==:URyOncHwAcdAfHWrHilKVm/wqh1990VFLF2esF7uFNM=', 'admin', 1),
(2, 'editor@settimes.ca', 'Editor', '6xX0ohzMf1PumBFMY2Z+/w==:EKlNs262pgHEwd3JLrg0Q7fuUea+gNU+LxmXVsQPUZY=', 'editor', 1),
(3, 'viewer@settimes.ca', 'Viewer', 'xVcJyrdL5oF4cB9J9iFxZA==:84JeF551+ZCfXsEb+g9d+btTs8hPxdiPZ7yunFbVfYM=', 'viewer', 1);
