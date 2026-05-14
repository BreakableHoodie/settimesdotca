-- Migration: Add ua_hash column to trusted_devices for independent UA validation (PEN-15)
-- Run: wrangler d1 execute settimes-db --remote --file=database/migrations/add-trusted-devices-ua-hash.sql

ALTER TABLE trusted_devices ADD COLUMN ua_hash TEXT;
