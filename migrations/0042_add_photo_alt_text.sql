-- Migration: 0042_add_photo_alt_text
-- Description: Add photo_alt_text to band_profiles so admins can supply accessible
--              alt text for a band's photo (falls back to the band name when empty).
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

ALTER TABLE band_profiles ADD COLUMN photo_alt_text TEXT;
