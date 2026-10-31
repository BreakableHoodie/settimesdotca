-- Migration 0082: drop the fan-email tables (fan email retired 2026-10-31).
--
-- settimes.ca no longer emails fans (CLAUDE.md "Email is account mail only").
-- The code that read these tables shipped first, in its own deploy, because
-- production applies migrations BEFORE the new code is live: dropping them in
-- the same release would have broken the old code still serving requests.
--
-- Migration 0081 already emptied them in that release. Children before
-- parents: D1 enforces foreign keys here whatever PRAGMA foreign_keys says.

DROP TABLE IF EXISTS band_announce_queue;
DROP TABLE IF EXISTS band_follow_notifications;
DROP TABLE IF EXISTS band_follows;

DROP TABLE IF EXISTS subscription_notifications;
DROP TABLE IF EXISTS subscription_unsubscribes;
DROP TABLE IF EXISTS subscription_verifications;
DROP TABLE IF EXISTS email_subscriptions;

-- The pre-#1152 fire-once latch on performances; nothing has read it since
-- per-follower tracking replaced it, and nothing indexes it.
ALTER TABLE performances DROP COLUMN band_follow_notified;
