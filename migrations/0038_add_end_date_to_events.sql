-- Migration: 0038_add_end_date_to_events
-- Description: Add end_date column to events table for structured data (MusicEvent schema requires endDate for Google rich results)
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

-- Write your migration SQL below:

ALTER TABLE events ADD COLUMN end_date TEXT;
