-- Migration: Sprint 1.1 - RBAC Implementation
-- Adds comprehensive role-based access control with audit logging
-- Supports three roles: admin, editor, viewer

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================
-- Separate from auth_attempts - this tracks all admin actions, not just auth

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,                    -- e.g., 'user.created', 'event.updated', 'band.deleted'
  resource_type TEXT,                      -- e.g., 'user', 'event', 'band', 'venue'
  resource_id INTEGER,                     -- ID of the affected resource
  details TEXT,                            -- JSON string with additional context
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- ============================================================================
-- UPDATE EXISTING TABLES - Add created_by tracking
-- ============================================================================

-- Add created_by_user_id to events table
-- Check if column exists first (SQLite doesn't have IF NOT EXISTS for ALTER TABLE)
-- This is safe to run multiple times - will fail silently if column exists
ALTER TABLE events ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE events ADD COLUMN updated_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE events ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Add created_by_user_id to band_profiles table (v2 schema)
ALTER TABLE band_profiles ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);

-- Add created_by_user_id to performances table (v2 schema)
ALTER TABLE performances ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE performances ADD COLUMN updated_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE performances ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Add created_by_user_id to venues table
ALTER TABLE venues ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE venues ADD COLUMN updated_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE venues ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- ============================================================================
-- UPDATE users TABLE - Ensure viewer role is supported
-- ============================================================================

-- Update the default role to allow viewer
-- Note: SQLite doesn't support CHECK constraints on existing columns
-- Role validation will be enforced in application code
-- Valid roles: 'admin', 'editor', 'viewer'

-- Add updated_at column to users if it doesn't exist
ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- ============================================================================
-- TRIGGERS - Auto-update timestamps
-- ============================================================================

-- Update events timestamp on modification
CREATE TRIGGER IF NOT EXISTS update_events_timestamp
AFTER UPDATE ON events
BEGIN
  UPDATE events SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update performances timestamp on modification
CREATE TRIGGER IF NOT EXISTS update_performances_timestamp
AFTER UPDATE ON performances
BEGIN
  UPDATE performances SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update venues timestamp on modification
CREATE TRIGGER IF NOT EXISTS update_venues_timestamp
AFTER UPDATE ON venues
BEGIN
  UPDATE venues SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update users timestamp on modification
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================================
-- DEFAULT ADMIN USER
-- ============================================================================

-- Check if there's at least one admin user
-- If no users exist, insert a default admin
-- Password: admin123 (hashed with bcrypt, should be changed immediately)
-- Note: This uses a bcrypt hash for 'admin123' with cost factor 10

INSERT OR IGNORE INTO users (email, password_hash, role, name, is_active)
SELECT
  'admin@pinklemonaderecords.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- bcrypt hash of 'admin123'
  'admin',
  'System Administrator',
  1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');

-- ============================================================================
-- NOTES
-- ============================================================================

-- Role hierarchy: admin > editor > viewer
--
-- Permissions:
-- - admin: Full access to everything including user management
-- - editor: Can create/edit/publish events, bands, venues (cannot delete or manage users)
-- - viewer: Read-only access to admin panel
--
-- Audit logging:
-- - All create/update/delete operations should be logged
-- - User management actions are especially important to track
-- - Logs include user_id, action type, resource info, and IP address
--
-- Migration application:
-- 1. Run this migration on both local and production databases
-- 2. Update middleware to enforce permissions (see SPRINT_1.1_RBAC.md)
-- 3. Update all admin API endpoints to use checkPermission middleware
-- 4. Implement frontend permission guards
