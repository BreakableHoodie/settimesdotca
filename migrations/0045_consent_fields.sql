-- Migration: 0045_consent_fields
-- Description: Add consent_ip + consent_method to email_follows for CASL/CAN-SPAM audit trail.
--   consent_ip: CF-Connecting-IP at form submission time (null = pre-migration rows)
--   consent_method: how the opt-in was collected (default 'web_form')
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

ALTER TABLE band_follows ADD COLUMN consent_ip TEXT;
ALTER TABLE band_follows ADD COLUMN consent_method TEXT NOT NULL DEFAULT 'web_form';

ALTER TABLE email_subscriptions ADD COLUMN consent_ip TEXT;
ALTER TABLE email_subscriptions ADD COLUMN consent_method TEXT NOT NULL DEFAULT 'web_form';
