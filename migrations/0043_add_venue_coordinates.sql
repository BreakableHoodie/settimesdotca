-- Migration: 0043_add_venue_coordinates
-- Description: Add latitude/longitude to venues to power walking-time hints
--              between stops on a crawl route (the King St venue cluster).
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

ALTER TABLE venues ADD COLUMN latitude REAL;
ALTER TABLE venues ADD COLUMN longitude REAL;
