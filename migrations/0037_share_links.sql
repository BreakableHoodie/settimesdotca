-- Migration: 0037_share_links
-- Description: share_links table for server-side schedule snapshot sharing.
--   Each row stores a snapshot of performance IDs and band names for a shared route,
--   with a 30-day TTL enforced lazily on reads and cleaned up by the scheduled worker.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

CREATE TABLE share_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_slug      TEXT    NOT NULL,
  performance_ids TEXT    NOT NULL,
  band_names      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_slug ON share_links(slug);
