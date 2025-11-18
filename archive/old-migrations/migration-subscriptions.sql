-- Migration: Add email subscription system
-- Run after: migration-multi-org.sql

-- Email subscriptions
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  city TEXT NOT NULL,                    -- "portland", "seattle", "all"
  genre TEXT NOT NULL,                   -- "punk", "indie", "all"
  frequency TEXT NOT NULL DEFAULT 'weekly', -- "daily", "weekly", "monthly"
  verified BOOLEAN NOT NULL DEFAULT 0,   -- Email verified via confirmation link
  verification_token TEXT UNIQUE,        -- Token for email verification
  unsubscribe_token TEXT UNIQUE NOT NULL, -- Token for unsubscribe link
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_email_sent TEXT,                  -- When was last email sent

  UNIQUE(email, city, genre)             -- Prevent duplicate subscriptions
);

-- Subscription verification log (for debugging)
CREATE TABLE IF NOT EXISTS subscription_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,                       -- For spam prevention

  FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id) ON DELETE CASCADE
);

-- Unsubscribe log (for metrics)
CREATE TABLE IF NOT EXISTS subscription_unsubscribes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  unsubscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT,                           -- Optional feedback

  FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON email_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_city_genre ON email_subscriptions(city, genre);
CREATE INDEX IF NOT EXISTS idx_subscriptions_verified ON email_subscriptions(verified);
CREATE INDEX IF NOT EXISTS idx_subscriptions_verification_token ON email_subscriptions(verification_token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_unsubscribe_token ON email_subscriptions(unsubscribe_token);
