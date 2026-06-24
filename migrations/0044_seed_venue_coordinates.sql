-- Migration: 0044_seed_venue_coordinates
-- Description: Populate latitude/longitude for the King St N (Waterloo) venues so
--              walkMinutesBetween() / the walking-itinerary UI has real data.
--              Columns were added in 0043; this seeds them.
--
-- Coordinates were geocoded (OSM/Nominatim) from each venue's street address as
-- stored in the `venues` table — building-centroid accuracy (~±20m), which is more
-- than enough for walk-time hints between stops ~50–300m apart on one street.
--
-- Blue Room is a room *inside* Revive Karaoke (both 28 King St N), so they share
-- the same coordinates. Jane Bond (5 Princess St W) is a historical venue — used in
-- Vol. 16, not part of the Vol. 17 crawl — but seeded too since it has an address.
--
-- Matched on venue name (the stable handle today); names taken from the production
-- `venues` table. Rows whose name doesn't match are simply left untouched.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

-- Vol. 17 crawl venues (south → north along King St N) ----------------------------
UPDATE venues SET latitude = 43.465868, longitude = -80.522191 WHERE name = 'Revive Karaoke';             -- 28 King St N
UPDATE venues SET latitude = 43.465868, longitude = -80.522191 WHERE name = 'Revive Karaoke (Blue Room)'; -- 28 King St N (same building)
UPDATE venues SET latitude = 43.466445, longitude = -80.522916 WHERE name = 'Room 47';                    -- 47 King St N
UPDATE venues SET latitude = 43.466554, longitude = -80.522382 WHERE name = 'Princess Cafe';              -- 46 King St N
UPDATE venues SET latitude = 43.467042, longitude = -80.522513 WHERE name = 'Prohibition Warehouse';      -- 56 King St N
UPDATE venues SET latitude = 43.467984, longitude = -80.523398 WHERE name = 'The Roost';                  -- 85 King St N

-- Historical / non-Vol.17 venue --------------------------------------------------
UPDATE venues SET latitude = 43.466644, longitude = -80.523329 WHERE name = 'Jane Bond';                  -- 5 Princess St W
