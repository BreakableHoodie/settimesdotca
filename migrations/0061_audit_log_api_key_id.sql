-- Migration: 0061_audit_log_api_key_id.sql
-- Records which API key authenticated a mutating request, so the audit trail
-- can answer "which credential did this" alongside the existing per-action rows.
-- NULL means cookie-authenticated.

ALTER TABLE audit_log ADD COLUMN api_key_id INTEGER REFERENCES api_keys(id);

CREATE INDEX idx_audit_log_api_key ON audit_log (api_key_id);
