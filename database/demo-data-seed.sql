-- SetTimes Sample Data Seed Script (V2 Schema Compatible)
-- Purpose: Create realistic sample data for Long Weekend Band Crawl (seasonal)
-- Event: Long Weekend Band Crawl (February 15, 2026)
-- Database: Cloudflare D1

-- =====================================================
-- SAMPLE EVENT DATA SEED
-- =====================================================

INSERT INTO events (name, date, slug, is_published, created_at) VALUES
('Long Weekend Band Crawl Vol. 15', '2026-02-15', 'long-weekend-band-crawl-vol-15', 1, datetime('now'));

-- =====================================================
-- CREATE VENUES
-- =====================================================

INSERT INTO venues (name, address, website, instagram, facebook, created_at) VALUES
('The Analog Cafe', '123 Queen Street West, Toronto, ON', 'https://analogcafe.com', 'analogcafe', 'analogcafeto', datetime('now')),
('Black Cat Tavern', '456 Dundas Street West, Toronto, ON', 'https://blackcattavern.ca', 'blackcattavern', 'blackcattavernto', datetime('now')),
('Velvet Underground', '789 College Street, Toronto, ON', 'https://velvetunderground.ca', 'velvetundergroundto', 'velvetundergroundtoronto', datetime('now')),
('Room 47', '321 Bloor Street West, Toronto, ON', 'https://room47.ca', 'room47to', null, datetime('now')),
('The Basement', '654 Ossington Avenue, Toronto, ON', null, 'thebasementto', 'thebasementbar', datetime('now'));

-- =====================================================
-- CREATE BAND PROFILES
-- =====================================================

INSERT INTO band_profiles (name, name_normalized, description, photo_url, genre, social_links) VALUES
('The Sunset Trio', 'the sunset trio', 'Jazz fusion trio from Toronto blending bebop with modern funk.', null, 'Jazz', '{"website": "https://thesunsettrio.com", "instagram": "thesunsettrio", "facebook": "thesunsettrio"}'),
('Electric Dreams', 'electric dreams', 'Electronic dance duo creating atmospheric soundscapes.', null, 'Electronic', '{"website": "https://electricdreamsband.com", "instagram": "electricdreamsband", "facebook": "electricdreamsmusic"}'),
('Northern Lights', 'northern lights', 'Indie folk quartet inspired by Canadian wilderness.', null, 'Folk', '{"instagram": "northernlightsband"}'),
('The Midnight Riders', 'the midnight riders', 'Classic rock covers band specializing in 70s and 80s hits.', null, 'Rock', '{"website": "https://midnightriders.band", "instagram": "midnightriders", "facebook": "midnightriders"}'),
('Neon Pulse', 'neon pulse', 'Synth-pop quintet bringing retro vibes with modern production.', null, 'Pop', '{"instagram": "neonpulseband", "facebook": "neonpulse"}'),
('The Wanderers', 'the wanderers', 'Alternative rock group with introspective lyrics.', null, 'Alternative', '{"website": "https://thewanderersmusic.ca", "instagram": "thewanderersband"}'),
('Ruby Red', 'ruby red', 'All-female punk rock powerhouse.', null, 'Punk', '{"website": "https://rubyredmusic.com", "instagram": "rubyredband", "facebook": "rubyredofficial"}'),
('The Cosmic Owls', 'the cosmic owls', 'Psychedelic rock sextet with theatrical stage presence.', null, 'Psych Rock', '{"instagram": "thecosmicowls", "facebook": "cosmicowlsband"}'),
('Starlight Serenade', 'starlight serenade', 'Dream pop collective creating ethereal soundscapes.', null, 'Dream Pop', '{"website": "https://starlightserenade.band", "instagram": "starlightserenade"}'),
('The Velvet Kings', 'the velvet kings', 'Blues and soul revivalists with a contemporary twist.', null, 'Blues', '{"website": "https://velvetkings.ca", "instagram": "velvetkings", "facebook": "thevelvetkings"}'),
('Crimson Wave', 'crimson wave', 'Experimental post-rock ensemble.', null, 'Post-Rock', '{"instagram": "crimsonwaveband", "facebook": "crimsonwave"}'),
('The Moonshine Collective', 'the moonshine collective', 'Bluegrass fusion group mixing traditional instrumentation.', null, 'Bluegrass', '{"website": "https://moonshinecollective.com", "instagram": "moonshinecollective"}'),
('Static Shock', 'static shock', 'Garage rock trio with raw energy and lo-fi aesthetics.', null, 'Garage Rock', '{"instagram": "staticshockband", "facebook": "staticshockmusic"}'),
('The Echoes', 'the echoes', 'Surf rock revival bringing 60s California vibes to Toronto.', null, 'Surf Rock', '{"website": "https://theechoesband.ca", "instagram": "theechoesband", "facebook": "echoesbandofficial"}'),
('Midnight Oil Revival', 'midnight oil revival', 'Tribute to Australian rock legends Midnight Oil.', null, 'Tribute', '{"instagram": "midnightoilrevival"}');

-- =====================================================
-- CREATE PERFORMANCES
-- =====================================================
-- Linking Event (1) -> Venue (1-5) -> Band Profile (1-15)

INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time) VALUES
-- The Analog Cafe (1)
(1, 1, 1, '19:00', '20:00'), -- The Sunset Trio
(1, 1, 2, '20:30', '21:30'), -- Electric Dreams
(1, 1, 3, '22:00', '23:00'), -- Northern Lights

-- Black Cat Tavern (2)
(1, 2, 4, '19:30', '20:30'), -- The Midnight Riders
(1, 2, 5, '21:00', '22:00'), -- Neon Pulse
(1, 2, 6, '22:30', '23:30'), -- The Wanderers

-- Velvet Underground (3)
(1, 3, 7, '19:00', '20:00'), -- Ruby Red
(1, 3, 8, '20:30', '21:45'), -- The Cosmic Owls
(1, 3, 9, '22:15', '23:15'), -- Starlight Serenade

-- Room 47 (4)
(1, 4, 10, '19:30', '20:45'), -- The Velvet Kings
(1, 4, 11, '21:15', '22:30'), -- Crimson Wave
(1, 4, 12, '23:00', '00:00'), -- The Moonshine Collective

-- The Basement (5)
(1, 5, 13, '19:00', '20:15'), -- Static Shock
(1, 5, 14, '20:45', '21:45'), -- The Echoes
(1, 5, 15, '22:15', '23:30'); -- Midnight Oil Revival

-- =====================================================
-- USER ACCOUNTS
-- =====================================================
-- Intentionally omitted. Use scripts/setup-local-db.sh or admin invite flow.
