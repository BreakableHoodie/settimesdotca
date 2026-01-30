-- Migration: Two-Factor Authentication (2FA) Support and RBAC
-- Supports TOTP, WebAuthn/Passkeys, and Email OTP
-- Adds Role-Based Access Control (admin, editor, read-only)

-- Add 2FA and RBAC fields to users table
ALTER TABLE users ADD COLUMN totp_secret TEXT;           -- Base32 encoded TOTP secret
ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN webauthn_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_otp_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN backup_codes TEXT;          -- JSON array of hashed backup codes
ALTER TABLE users ADD COLUMN require_2fa INTEGER DEFAULT 1;  -- Require 2FA for this user
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;    -- Account active status
ALTER TABLE users ADD COLUMN deactivated_at TEXT;            -- When account was deactivated
ALTER TABLE users ADD COLUMN deactivated_by INTEGER REFERENCES users(id); -- Who deactivated

-- Add check constraint for role field (supports admin, editor, read-only)
-- Note: SQLite doesn't support adding constraints to existing columns,
-- so we'll enforce this in application code

-- WebAuthn credentials table (users can have multiple passkeys/devices)
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,     -- Base64 encoded credential ID
  public_key TEXT NOT NULL,               -- Base64 encoded public key
  counter INTEGER NOT NULL DEFAULT 0,     -- Signature counter for replay protection
  device_name TEXT,                       -- User-friendly name (e.g., "iPhone 15", "YubiKey")
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials(credential_id);

-- Email OTP codes table (temporary codes)
CREATE TABLE IF NOT EXISTS email_otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,                -- Hash of the 6-digit code
  expires_at TEXT NOT NULL,               -- Codes expire after 10 minutes
  verified INTEGER DEFAULT 0,             -- 1 if code was used successfully
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_otp_user_id ON email_otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_email_otp_expires ON email_otp_codes(expires_at);

-- Authentication attempts tracking (for rate limiting and security)
CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,                             -- Store email even if user doesn't exist
  ip_address TEXT,
  user_agent TEXT,
  attempt_type TEXT NOT NULL,             -- 'login', 'totp', 'webauthn', 'email_otp'
  success INTEGER NOT NULL,               -- 1 for success, 0 for failure
  failure_reason TEXT,                    -- Why it failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_user ON auth_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_created ON auth_attempts(created_at);

-- Active sessions table (replace sessionStorage with server-side sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,     -- UUID session token
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  remember_me INTEGER DEFAULT 0,          -- Long-lived session if 1
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL                -- Session expiry time
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

-- Password reset tokens (for admin-initiated resets)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,              -- UUID token for reset link
  created_by INTEGER NOT NULL REFERENCES users(id), -- Admin who initiated reset
  expires_at TEXT NOT NULL,                -- Tokens expire after 24 hours
  used INTEGER DEFAULT 0,                  -- 1 if token was used
  used_at TEXT,                           -- When token was used
  ip_address TEXT,                        -- IP that used the token
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

-- Clean up expired data periodically (run via cron or manually)
-- DELETE FROM email_otp_codes WHERE expires_at < datetime('now');
-- DELETE FROM sessions WHERE expires_at < datetime('now');
-- DELETE FROM auth_attempts WHERE created_at < datetime('now', '-90 days');
-- DELETE FROM password_reset_tokens WHERE expires_at < datetime('now');
