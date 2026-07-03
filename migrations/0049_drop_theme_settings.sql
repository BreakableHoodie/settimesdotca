-- Migration: 0049_drop_theme_settings
-- Description: Drop the unused theme_settings table.
--   Created in 0008 for a single global primary/secondary/accent/text color
--   scheme, since superseded by the 4-theme CSS custom-property system
--   (frontend/src/index.css, data-theme on <html>, persisted in localStorage).
--   No code path in functions/ or frontend/ reads or writes this table — it
--   was fully replaced, never migrated. The single stale production row's
--   values are preserved in issue #506's comments for the record.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

DROP TABLE IF EXISTS theme_settings;
