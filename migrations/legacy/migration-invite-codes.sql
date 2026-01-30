-- Migration: Add Invite Code System
-- Secures signup endpoint by requiring valid invite codes
-- This prevents unauthorized account creation

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,              -- Random invite code (UUID)
  email TEXT,                             -- Optional: restrict to specific email
  role TEXT NOT NULL DEFAULT 'editor',    -- Role for new account (viewer, editor, admin)
  created_by_user_id INTEGER,             -- Admin who created the invite
  used_by_user_id INTEGER,                -- User who used the invite (NULL if unused)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,                           -- When the invite was used
  expires_at TEXT NOT NULL,               -- Expiration timestamp
  is_active INTEGER NOT NULL DEFAULT 1,   -- 0 = disabled, 1 = active

  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_active ON invite_codes(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_invite_codes_email ON invite_codes(email);

-- Example: Create an invite code for testing (expires in 7 days)
-- Uncomment and run this after migration to create your first invite:
-- INSERT INTO invite_codes (code, role, expires_at)
-- VALUES ('INITIAL-INVITE-' || hex(randomblob(8)), 'admin', datetime('now', '+7 days'));
