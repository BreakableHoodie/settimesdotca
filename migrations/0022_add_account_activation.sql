-- Add account activation fields
-- Migration: 0022_add_account_activation

ALTER TABLE users ADD COLUMN activation_token TEXT;
ALTER TABLE users ADD COLUMN activation_token_expires_at TEXT;
ALTER TABLE users ADD COLUMN activated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_activation_token ON users(activation_token);

-- Mark existing users as activated (preserve current is_active state)
UPDATE users
SET activated_at = COALESCE(activated_at, datetime('now'))
WHERE activated_at IS NULL;
