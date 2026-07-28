-- Migration: Add ua_hash column to trusted_devices for independent UA validation (PEN-15)
-- HISTORICAL RECORD — DO NOT RUN. This column is already present in production.
-- Kept only to document what was applied. Archived from database/migrations/.

ALTER TABLE trusted_devices ADD COLUMN ua_hash TEXT;
