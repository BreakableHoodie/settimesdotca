-- Migration: Simplify to single-org with multi-user support
-- Pink Lemonade Records - Waterloo Region
-- Removes multi-org complexity, keeps role-based access

-- Drop multi-org tables
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS rate_limit;
DROP TABLE IF EXISTS auth_audit;

-- Recreate users table (simpler, no org_id)
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', -- 'admin' or 'editor'
  name TEXT,                            -- Optional display name
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

-- Create initial admin user (password must be set via signup)
-- This is just a placeholder for the first admin signup

-- Update events table to remove org references
-- Events table already has city field, just ensure it's set correctly
-- No schema changes needed for events

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Update email_subscriptions to use Waterloo region cities
-- The table structure is fine, just need to update the city values used
