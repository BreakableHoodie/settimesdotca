-- Migration: 0044_seed_venue_coordinates
-- Description: Populate latitude/longitude for the King St N (Waterloo) venues so
--              walkMinutesBetween() / the walking-itinerary UI has real data.
--              Columns were added in 0043; this seeds them.
--
-- ⚠️  DRAFT COORDINATES — APPROXIMATE, VERIFY BEFORE PRODUCTION ⚠️
--     These are plausible uptown-Waterloo King St N positions, accurate enough to
--     wire and test the walk-time feature (relative geometry between stops is what
--     drives the buffer math). Replace with surveyed/geocoded values from each
--     venue's real street address before relying on them for fan-facing walk times.
--     Source of truth should be the venue's postal address geocoded to WGS84.
--
-- Matched on venue name (the only stable handle we have today); names taken from
-- the production `venues` table. Vol. 17's six rooms are the Princess/Prohibition/
-- Revive/Revive(Blue Room)/Room 47/Roost set; "Jane Bond" is an older venue kept
-- for historical events. Rows whose name doesn't match are simply left untouched.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

-- Vol. 17 crawl venues (west-to-east-ish along King St N) -------------------------
UPDATE venues SET latitude = 43.46500, longitude = -80.52410 WHERE name = 'The Roost';
UPDATE venues SET latitude = 43.46555, longitude = -80.52360 WHERE name = 'Princess Cafe';
UPDATE venues SET latitude = 43.46590, longitude = -80.52330 WHERE name = 'Revive Karaoke (Blue Room)';
UPDATE venues SET latitude = 43.46600, longitude = -80.52320 WHERE name = 'Revive Karaoke';
UPDATE venues SET latitude = 43.46655, longitude = -80.52250 WHERE name = 'Room 47';
UPDATE venues SET latitude = 43.46710, longitude = -80.52205 WHERE name = 'Prohibition Warehouse';

-- Historical / non-Vol.17 venue --------------------------------------------------
UPDATE venues SET latitude = 43.46580, longitude = -80.52340 WHERE name = 'Jane Bond';
