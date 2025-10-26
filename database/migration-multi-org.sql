-- Migration: Add multi-org support with user accounts
-- Run after: schema.sql

-- Organizations table (promoters, venues, production companies)
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- "Pink Lemonade Records"
  slug TEXT NOT NULL UNIQUE,             -- "pink-lemonade"
  email TEXT,                            -- Contact email
  website TEXT,                          -- Optional website
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users table (replaces single-password auth)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- bcrypt hash
  org_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',    -- 'admin', 'editor', 'viewer'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,

  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Add org_id to existing tables
ALTER TABLE events ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE venues ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE bands ADD COLUMN org_id INTEGER REFERENCES organizations(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(org_id);
CREATE INDEX IF NOT EXISTS idx_bands_org ON bands(org_id);

-- Seed initial organizations (Pink Lemonade, Fat Scheid)
INSERT INTO organizations (name, slug, email) VALUES
  ('Pink Lemonade Records', 'pink-lemonade', 'info@pinklemonaderecords.com'),
  ('Fat Scheid', 'fat-scheid', 'info@fatscheid.com');

-- Create default admin users (update with real emails)
-- Password: 'changeme123' (bcrypt hashed)
INSERT INTO users (email, password_hash, org_id, role) VALUES
  ('admin@pinklemonaderecords.com', '$2b$10$rKq7H3Ck9gJ5qW8sN6T5.eF3P4wQ7mR2jS9kL1nM0oT8pU6vZ4xYa', 1, 'admin'),
  ('admin@fatscheid.com', '$2b$10$rKq7H3Ck9gJ5qW8sN6T5.eF3P4wQ7mR2jS9kL1nM0oT8pU6vZ4xYa', 2, 'admin');
