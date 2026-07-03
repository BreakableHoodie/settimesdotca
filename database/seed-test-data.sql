-- Test Data: Events, Venues, Band Profiles, and Performances
-- Run with: npx wrangler d1 execute DB --local --file=database/seed-test-data.sql
--
-- Note: the legacy v1 `bands` table (and its ~150 fixture rows) was removed in
-- #506 — no API reads it (the public timeline reads band_profiles +
-- performances), and production has no such table.

-- ============================================
-- VENUES (20 venues across different cities)
-- ============================================

INSERT OR REPLACE INTO venues (id, name, address, city, website) VALUES
-- Waterloo Region venues
(1, 'Waterloo Music Hall', '75 King St N', 'Waterloo', 'https://waterloohall.ca'),
(2, 'The Kitchener Arms', '22 Queen St S', 'Kitchener', 'https://kitchenerarms.ca'),
(3, 'Cambridge Folk Club', '16 Main St', 'Cambridge', 'https://cambridgefolkclub.ca'),
(4, 'The Iron Horse', '48 King St W', 'Kitchener', 'https://ironhorse.ca'),
(5, 'Stage 86', '86 Erb St W', 'Waterloo', 'https://stage86.ca'),
-- Toronto venues
(6, 'Lee''s Palace', '529 Bloor St W', 'Toronto', 'https://leespalace.com'),
(7, 'The Horseshoe Tavern', '370 Queen St W', 'Toronto', 'https://horseshoetavern.com'),
(8, 'Velvet Underground', '508 Queen St W', 'Toronto', 'https://thevelvet.ca'),
(9, 'The Phoenix Concert Theatre', '410 Sherbourne St', 'Toronto', 'https://thephoenixconcerttheatre.com'),
(10, 'The Drake Hotel', '1150 Queen St W', 'Toronto', 'https://thedrake.ca'),
-- Montreal venues
(11, 'Casa del Popolo', '4873 St Laurent Blvd', 'Montreal', 'https://casadelpopolo.com'),
(12, 'Bar Le Ritz PDB', '179 Jean-Talon W', 'Montreal', 'https://barleritzpdb.com'),
(13, 'L''Astral', '305 Ste-Catherine St W', 'Montreal', 'https://sallelastral.com'),
(14, 'Foufounes Électriques', '87 Ste-Catherine St E', 'Montreal', 'https://foufritz.com'),
(15, 'Le National', '1220 Ste-Catherine St E', 'Montreal', 'https://lenational.ca'),
-- Other cities
(16, 'Call the Office', '216 York St', 'London', 'https://calltheoffice.com'),
(17, 'This Ain''t Hollywood', '345 James St N', 'Hamilton', 'https://thisainthollywood.ca'),
(18, 'The Mansion', '506 Princess St', 'Kingston', 'https://themansionkingston.com'),
(19, 'Maxwell''s Concerts', '35 University Ave E', 'Waterloo', 'https://maxwellswaterloo.ca'),
(20, 'Rum Runners', '178 Dundas St', 'London', 'https://rumrunners.com');

-- ============================================
-- EVENTS (12 monthly events + special events)
-- ============================================

INSERT OR REPLACE INTO events (id, name, date, slug, is_published, status, description, city, ticket_url) VALUES
-- Past events (for testing past events display)
(1, 'Winter Warm-Up 2024', '2024-01-20', 'winter-warm-up-2024', 1, 'published', 'Kick off the year with hot sounds on a cold night. Multi-venue indoor festival featuring 30+ local and touring acts.', 'Waterloo', NULL),
(2, 'Frost Fest 2024', '2024-02-17', 'frost-fest-2024', 1, 'published', 'Celebrate the winter season with live music across downtown venues. Three nights of folk, rock, and electronic performances.', 'Waterloo', NULL),
(3, 'Spring Thaw Festival', '2024-03-23', 'spring-thaw-2024', 1, 'published', 'As the ice melts, the music heats up. Showcasing emerging Canadian talent.', 'Toronto', NULL),
(4, 'April Amplified', '2024-04-13', 'april-amplified-2024', 1, 'published', 'A celebration of loud guitars and louder drums. All-ages punk and metal showcase.', 'Montreal', NULL),
(5, 'Tulip Tunes Festival', '2024-05-18', 'tulip-tunes-2024', 1, 'published', 'Music blooms during tulip season. Outdoor and indoor performances celebrating spring.', 'Waterloo', NULL),
(6, 'Summer Solstice Sessions', '2024-06-21', 'summer-solstice-2024', 1, 'published', 'The longest day deserves the longest party. 12 hours of continuous music.', 'Toronto', NULL),
(7, 'Canada Day Rock Fest', '2024-07-01', 'canada-day-2024', 1, 'published', 'Celebrate Canada with homegrown rock and roll. Free outdoor stages plus ticketed evening shows.', 'Waterloo', NULL),
(8, 'August Heat Wave', '2024-08-10', 'august-heat-2024', 1, 'published', 'The hottest bands for the hottest month. Dance music, hip-hop, and R&B showcase.', 'Montreal', NULL),
(9, 'Labour Day Loud', '2024-09-02', 'labour-day-2024', 1, 'published', 'Send off summer with a bang. Two days of punk, hardcore, and metal.', 'Hamilton', NULL),
(10, 'Autumn Acoustics', '2024-10-12', 'autumn-acoustics-2024', 1, 'published', 'Intimate acoustic performances as leaves change color. Folk, singer-songwriter, and jazz.', 'Kingston', NULL),
(11, 'Halloween Havoc 2024', '2024-10-31', 'halloween-havoc-2024', 1, 'published', 'Costumes encouraged! Dark wave, goth, and spooky sounds all night long.', 'Toronto', NULL),

-- Current/Upcoming events
(12, 'November Noise Fest', '2024-11-16', 'november-noise-2024', 1, 'published', 'Experimental, noise, and avant-garde music festival. Push your sonic boundaries.', 'Montreal', 'https://ticketscene.ca/november-noise'),
(13, 'Holiday Hootenanny 2024', '2024-12-14', 'holiday-hootenanny-2024', 1, 'published', 'Annual holiday party with local favorites. Ugly sweaters welcome!', 'Waterloo', 'https://ticketscene.ca/holiday-2024'),
(14, 'New Year''s Eve Bash 2024', '2024-12-31', 'nye-2024', 1, 'published', 'Ring in 2025 with multiple stages of live music. Countdown to midnight with Canada''s best.', 'Toronto', 'https://ticketscene.ca/nye-2024'),

-- 2025 Events
(15, 'Winter Warm-Up 2025', '2025-01-18', 'winter-warm-up-2025', 1, 'published', 'Start 2025 right with blazing hot performances. Multi-venue winter festival returns.', 'Waterloo', 'https://ticketscene.ca/winter-warmup-2025'),
(16, 'Frost Fest 2025', '2025-02-15', 'frost-fest-2025', 1, 'published', 'Valentine''s weekend musical companion. Three venues, 40 bands, one cold weekend.', 'Waterloo', 'https://ticketscene.ca/frost-fest-2025'),
(17, 'Spring Thaw 2025', '2025-03-22', 'spring-thaw-2025', 1, 'published', 'Emerging artists showcase as winter fades. Indie rock, folk, and electronica.', 'Toronto', 'https://ticketscene.ca/spring-thaw-2025'),
(18, 'April Amplified 2025', '2025-04-12', 'april-amplified-2025', 1, 'published', 'Heavy music for heavy times. Punk, metal, hardcore celebration.', 'Montreal', 'https://ticketscene.ca/april-amp-2025'),
(19, 'Tulip Tunes 2025', '2025-05-17', 'tulip-tunes-2025', 1, 'published', 'Music festival during tulip season. Garden party vibes.', 'Waterloo', 'https://ticketscene.ca/tulip-2025'),
(20, 'Summer Solstice 2025', '2025-06-21', 'summer-solstice-2025', 1, 'published', 'Longest day, biggest party. Noon to midnight music marathon.', 'Toronto', 'https://ticketscene.ca/solstice-2025'),
(21, 'Canada Day Festival 2025', '2025-07-01', 'canada-day-2025', 1, 'published', 'Celebrate Canada with live music across the region and beyond.', 'Waterloo', 'https://ticketscene.ca/canada-day-2025'),
(22, 'August Heat Wave 2025', '2025-08-09', 'august-heat-2025', 1, 'published', 'Summer''s peak brings peak performances. Dance all night under the stars.', 'Montreal', 'https://ticketscene.ca/august-heat-2025'),
(23, 'Labour Day Loud 2025', '2025-09-01', 'labour-day-2025', 1, 'published', 'End of summer blowout. Three days of loud, fast music.', 'Hamilton', 'https://ticketscene.ca/labour-loud-2025'),
(24, 'Autumn Acoustics 2025', '2025-10-11', 'autumn-acoustics-2025', 1, 'published', 'Cozy acoustic shows as leaves turn. Intimate venues, big talent.', 'Kingston', 'https://ticketscene.ca/autumn-2025'),
(25, 'Halloween Havoc 2025', '2025-10-31', 'halloween-havoc-2025', 1, 'published', 'Spooky season''s biggest party. Dark sounds, darker costumes.', 'Toronto', 'https://ticketscene.ca/halloween-2025'),
(26, 'November Noise 2025', '2025-11-15', 'november-noise-2025', 1, 'published', 'Experimental music festival. Noise, drone, ambient, and beyond.', 'Montreal', 'https://ticketscene.ca/noise-2025'),
(27, 'Holiday Hootenanny 2025', '2025-12-13', 'holiday-hootenanny-2025', 1, 'published', 'Annual holiday celebration with community favorites.', 'Waterloo', 'https://ticketscene.ca/holiday-2025');

-- Future Test Event (always in the future for E2E tests)
-- Uses date('now', '+14 days') so it always falls in the timeline's 30-day upcoming window
INSERT OR REPLACE INTO events (id, name, date, slug, is_published, status, description, city, ticket_url) VALUES
(28, 'Future Fest E2E', date('now', '+14 days'), 'future-fest-e2e', 1, 'published', 'An annual celebration of live music. Multi-venue festival featuring local and touring acts across Waterloo Region venues.', 'Waterloo', 'https://ticketscene.ca/future-fest-e2e');

-- ============================================
-- BAND PROFILES + PERFORMANCES for Future Fest E2E (Event 28)
-- The public timeline API reads band_profiles + performances. Without these,
-- every event card expands with 0 venues and 0 performers, making
-- venue/performer heading assertions impossible in E2E tests.
-- ============================================

INSERT OR REPLACE INTO band_profiles (id, name, name_normalized, genre, origin, description) VALUES
(1, 'The Time Travellers', 'the time travellers', 'Indie Rock', 'Waterloo', 'Indie rock from the future'),
(2, 'Future Sound', 'future sound', 'Electronic', 'Toronto', 'Electronic music ahead of its time'),
(3, 'The Prophets', 'the prophets', 'Post-Rock', 'Montreal', 'Instrumental post-rock soundscapes'),
(4, 'Tomorrows Echo', 'tomorrows echo', 'Dream Pop', 'Waterloo', 'Dreamy sounds from the future');

INSERT OR REPLACE INTO performances (id, event_id, band_profile_id, venue_id, start_time, end_time) VALUES
(1, 28, 1, 1, '19:00', '19:45'),
(2, 28, 2, 1, '20:00', '20:45'),
(3, 28, 3, 2, '21:00', '22:00'),
(4, 28, 4, 2, '22:00', '23:00');

-- Update sqlite_sequence if needed
DELETE FROM sqlite_sequence WHERE name IN ('venues', 'events', 'band_profiles', 'performances');
INSERT INTO sqlite_sequence (name, seq) VALUES ('venues', 20), ('events', 28), ('band_profiles', 4), ('performances', 4);
