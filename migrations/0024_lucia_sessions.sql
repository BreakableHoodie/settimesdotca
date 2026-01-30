-- Migration: 0024_lucia_sessions.sql
-- Add Lucia-compatible sessions table and migrate existing sessions

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

INSERT OR IGNORE INTO lucia_sessions (
  id,
  user_id,
  expires_at,
  ip_address,
  user_agent,
  remember_me,
  created_at,
  last_activity_at
)
SELECT
  session_token,
  user_id,
  CASE
    WHEN typeof(expires_at) = 'integer' THEN expires_at
    WHEN typeof(expires_at) = 'text' THEN CAST(
      strftime('%s', replace(replace(expires_at, 'T', ' '), 'Z', '')) AS INTEGER
    )
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END,
  ip_address,
  user_agent,
  remember_me,
  COALESCE(created_at, datetime('now')),
  COALESCE(last_activity_at, created_at, datetime('now'))
FROM sessions
WHERE session_token IS NOT NULL;
