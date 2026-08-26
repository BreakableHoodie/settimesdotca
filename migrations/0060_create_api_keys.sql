-- Migration: 0060_create_api_keys.sql
-- Stores high-entropy machine-to-machine credentials for the admin API.

CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  -- RESTRICT, not CASCADE: deleting the row would destroy the attribution an
  -- incident needs. Deleting a user who still holds keys must fail loudly so
  -- the revoke step cannot be silently skipped. Part 2 adds that step to the
  -- user-delete path; until an endpoint exists no key can be created, so
  -- nothing can hit this yet.
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- SEC-F1 made unstorable rather than merely handled. A T-separated value
  -- ('2026-01-01T00:00:00Z') is what turned a string comparison into a
  -- production expiry bypass; this makes the shape illegal at the layer it
  -- would have to originate from. Write with toSqliteDateTime().
  expires_at TEXT NOT NULL CHECK(expires_at LIKE '____-__-__ __:__:__'),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_keys_created_by ON api_keys (created_by);
