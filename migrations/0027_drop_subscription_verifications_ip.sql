-- Migration: Drop unused ip_address column from subscription_verifications
--
-- This column was added in the original subscriptions schema as a placeholder
-- for spam prevention, but was never populated by any application code.
-- Dropping it removes an accidental PII surface (GDPR storage minimisation).

ALTER TABLE subscription_verifications DROP COLUMN ip_address;
