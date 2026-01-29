-- Migration: Sprint 1.2 - Event Management Complete
-- Adds event lifecycle management with status tracking and archival
-- Migrates from is_published (boolean) to status (text) field

-- ============================================================================
-- ADD NEW COLUMNS
-- ============================================================================

-- Add status column (will replace is_published)
-- Values: 'draft', 'published', 'archived'
ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'draft';

-- Add archived_at timestamp for tracking when events were archived
ALTER TABLE events ADD COLUMN archived_at TEXT;

-- ============================================================================
-- MIGRATE EXISTING DATA
-- ============================================================================

-- Migrate existing is_published values to status field
-- is_published = 1 -> status = 'published'
-- is_published = 0 -> status = 'draft'
UPDATE events SET status = 'published' WHERE is_published = 1;
UPDATE events SET status = 'draft' WHERE is_published = 0;

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- Index for archived events (for efficient filtering)
CREATE INDEX IF NOT EXISTS idx_events_archived ON events(archived_at);

-- ============================================================================
-- NOTES
-- ============================================================================

-- Event Status Lifecycle:
-- 1. draft -> published (via publish endpoint)
-- 2. published -> draft (via unpublish endpoint)
-- 3. any status -> archived (via archive endpoint, admin only)
-- 4. archived events cannot be unarchived via API (requires manual DB operation)
--
-- The is_published column is kept for backwards compatibility during migration.
-- It can be dropped in a future migration once all code is updated.
--
-- Archived events:
-- - Hidden from default event listings (require archived=true query param)
-- - Still accessible via direct ID lookup
-- - archived_at timestamp set when archived
-- - Cannot be published or edited without confirmation
--
-- Business Rules:
-- - Cannot publish event with 0 bands
-- - Cannot change slug after creation (breaks URLs)
-- - Only admins can archive or delete events
-- - Editors can create, update, and publish events
-- - Viewers can only read events
