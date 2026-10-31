-- Migration 0081: delete all fan-email data (fan email retired 2026-10-31).
--
-- settimes.ca no longer emails fans (CLAUDE.md "Email is account mail only").
-- This empties the tables, deleting every stored fan email address, consent
-- IP and token, which makes the privacy policy's "we deleted" true the moment
-- this release goes live. The tables themselves are dropped by a later
-- migration: production applies migrations BEFORE the new code is live, and
-- the old code still reads these tables until then (an empty table is fine; a
-- missing one would be a 500). Children before parents.

DELETE FROM band_announce_queue;
DELETE FROM band_follow_notifications;
DELETE FROM band_follows;

DELETE FROM subscription_notifications;
DELETE FROM subscription_unsubscribes;
DELETE FROM subscription_verifications;
DELETE FROM email_subscriptions;
