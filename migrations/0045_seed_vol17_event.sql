-- Migration: 0045_seed_vol17_event
-- Description: Create the Long Weekend Band Crawl - Vol. 17 event (the target event),
--              modeled on Vol. 16. UNPUBLISHED on purpose — the lineup (bands → venues
--              → set times, i.e. the `performances` rows) is added later via the admin
--              UI, and the team flips is_published when it's ready. No performances are
--              seeded here.
--
-- Date/ticket URL from the official ticketscene listing (event 62461): Sunday,
-- August 2, 2026, doors 6:30 PM / show 6:45 PM, 19+, Waterloo (6 King St N venues).
--
-- Idempotent: only inserts if an event with slug 'lwbc17' doesn't already exist, so
-- re-applying (or running where it was created via the admin UI) is a no-op.
--
-- Numbered 0045 to sit after 0044 (venue coordinates). Apply order is by filename.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

INSERT INTO events (name, date, slug, is_published, status, ticket_url, social_links, city, reveal_mode)
SELECT
  'Long Weekend Band Crawl - Vol. 17',
  '2026-08-02',
  'lwbc17',
  0,        -- unpublished: do NOT surface publicly until the team publishes it
  'draft',
  'https://ticketscene.ca/events/62461/',
  '{"website":null,"instagram":null,"facebook":null,"x":null,"tiktok":null,"youtube":null,"bandcamp":null}',
  'Waterloo, ON',
  0
WHERE NOT EXISTS (SELECT 1 FROM events WHERE slug = 'lwbc17');
