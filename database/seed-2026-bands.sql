-- 2026 Events - Bands and Performances Seed Data
-- Populates Winter Warm-Up, Frost Fest, Spring Thaw, and Tulip Tunes with bands
-- Bands repeat across events for realistic multi-event testing

-- ============================================
-- Winter Warm-Up 2026 (Jan 17, event_id: 28)
-- ============================================

-- The Electric Hearts (repeats in multiple events)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (28, 1, 'The Electric Hearts', '2026-01-17 20:00', '2026-01-17 20:45', 'Indie Rock', 'High-energy indie rock with infectious melodies', 'https://electrichearts.band');

-- Neon Shadows (repeats in multiple events)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (28, 2, 'Neon Shadows', '2026-01-17 21:00', '2026-01-17 21:45', 'Synth Pop', 'Atmospheric synth-pop with dreamy vocals', 'https://neonshadows.music');

-- Crimson Wave
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (28, 3, 'Crimson Wave', '2026-01-17 22:00', '2026-01-17 22:45', 'Alternative', 'Alternative rock with heavy bass lines', 'https://crimsonwave.rocks');

-- The Velvet Underground Revival (repeats)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (28, 4, 'The Velvet Underground Revival', '2026-01-17 23:00', '2026-01-17 23:45', 'Art Rock', 'Experimental art rock tribute', 'https://velvetu.com');

-- Midnight Echoes (repeats)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (28, 5, 'Midnight Echoes', '2026-01-17 20:30', '2026-01-17 21:15', 'Post-Punk', 'Dark post-punk with atmospheric guitar', 'https://midnightechoes.band');

-- Static Bloom
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (28, 1, 'Static Bloom', '2026-01-17 21:30', '2026-01-17 22:15', 'Shoegaze', 'Dreamy shoegaze soundscapes', 'https://staticbloom.music');

-- ============================================
-- Frost Fest 2026 (Feb 14, event_id: 29)
-- ============================================

-- The Electric Hearts (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (29, 2, 'The Electric Hearts', '2026-02-14 19:30', '2026-02-14 20:15', 'Indie Rock', 'High-energy indie rock with infectious melodies', 'https://electrichearts.band');

-- Velvet Dreams (repeats)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (29, 1, 'Velvet Dreams', '2026-02-14 20:00', '2026-02-14 20:45', 'Dream Pop', 'Ethereal dream pop for Valentine''s Day', 'https://velvetdreams.band');

-- Neon Shadows (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (29, 3, 'Neon Shadows', '2026-02-14 21:00', '2026-02-14 21:45', 'Synth Pop', 'Atmospheric synth-pop with dreamy vocals', 'https://neonshadows.music');

-- The Starlight Collective
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (29, 4, 'The Starlight Collective', '2026-02-14 22:00', '2026-02-14 22:45', 'Indie Folk', 'Romantic indie folk harmonies', 'https://starlightcollective.com');

-- Midnight Echoes (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (29, 5, 'Midnight Echoes', '2026-02-14 20:30', '2026-02-14 21:15', 'Post-Punk', 'Dark post-punk with atmospheric guitar', 'https://midnightechoes.band');

-- Ruby Valentine
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (29, 2, 'Ruby Valentine', '2026-02-14 21:30', '2026-02-14 22:15', 'Soul', 'Soulful vocals and romantic ballads', 'https://rubyvalentine.music');

-- ============================================
-- Spring Thaw 2026 (Mar 21, event_id: 30)
-- ============================================

-- The Velvet Underground Revival (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (30, 1, 'The Velvet Underground Revival', '2026-03-21 20:00', '2026-03-21 20:45', 'Art Rock', 'Experimental art rock tribute', 'https://velvetu.com');

-- Greenhouse Effect (repeats)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (30, 2, 'Greenhouse Effect', '2026-03-21 21:00', '2026-03-21 21:45', 'Indie Pop', 'Fresh indie pop with spring vibes', 'https://greenhouseeffect.band');

-- The Electric Hearts (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (30, 3, 'The Electric Hearts', '2026-03-21 22:00', '2026-03-21 22:45', 'Indie Rock', 'High-energy indie rock with infectious melodies', 'https://electrichearts.band');

-- Solar Flares
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (30, 4, 'Solar Flares', '2026-03-21 23:00', '2026-03-21 23:45', 'Garage Rock', 'Raw garage rock energy', 'https://solarflares.rocks');

-- Velvet Dreams (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (30, 5, 'Velvet Dreams', '2026-03-21 20:30', '2026-03-21 21:15', 'Dream Pop', 'Ethereal dream pop soundscapes', 'https://velvetdreams.band');

-- New Dawn Collective
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (30, 1, 'New Dawn Collective', '2026-03-21 21:30', '2026-03-21 22:15', 'Folk Rock', 'Uplifting folk rock anthems', 'https://newdawncollective.com');

-- ============================================
-- Tulip Tunes 2026 (May 16, event_id: 32)
-- ============================================

-- Greenhouse Effect (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 1, 'Greenhouse Effect', '2026-05-16 18:00', '2026-05-16 18:45', 'Indie Pop', 'Fresh indie pop with spring vibes', 'https://greenhouseeffect.band');

-- The Electric Hearts (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 2, 'The Electric Hearts', '2026-05-16 19:00', '2026-05-16 19:45', 'Indie Rock', 'High-energy indie rock with infectious melodies', 'https://electrichearts.band');

-- Petal Pushers
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 3, 'Petal Pushers', '2026-05-16 20:00', '2026-05-16 20:45', 'Indie Folk', 'Acoustic indie folk for outdoor festivals', 'https://petalpushers.band');

-- Neon Shadows (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 4, 'Neon Shadows', '2026-05-16 21:00', '2026-05-16 21:45', 'Synth Pop', 'Atmospheric synth-pop with dreamy vocals', 'https://neonshadows.music');

-- The Garden Party
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 5, 'The Garden Party', '2026-05-16 19:30', '2026-05-16 20:15', 'Funk', 'Groovy funk for outdoor celebrations', 'https://gardenparty.funk');

-- Velvet Dreams (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 1, 'Velvet Dreams', '2026-05-16 20:30', '2026-05-16 21:15', 'Dream Pop', 'Ethereal dream pop soundscapes', 'https://velvetdreams.band');

-- Bloom & Decay
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (32, 2, 'Bloom & Decay', '2026-05-16 21:30', '2026-05-16 22:15', 'Alternative', 'Melancholic alternative rock', 'https://bloomanddecay.music');

-- ============================================
-- Summer Solstice 2026 (Jun 20, event_id: 33)
-- ============================================

-- The Electric Hearts (returning - popular band)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (33, 1, 'The Electric Hearts', '2026-06-20 20:00', '2026-06-20 20:45', 'Indie Rock', 'High-energy indie rock with infectious melodies', 'https://electrichearts.band');

-- Solar Flares (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (33, 2, 'Solar Flares', '2026-06-20 21:00', '2026-06-20 21:45', 'Garage Rock', 'Raw garage rock energy', 'https://solarflares.rocks');

-- Midnight Sun Collective
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (33, 3, 'Midnight Sun Collective', '2026-06-20 22:00', '2026-06-20 22:45', 'Psychedelic Rock', 'Trippy psychedelic jams for the longest day', 'https://midnightsun.band');

-- Neon Shadows (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (33, 4, 'Neon Shadows', '2026-06-20 23:00', '2026-06-20 23:45', 'Synth Pop', 'Atmospheric synth-pop with dreamy vocals', 'https://neonshadows.music');

-- Greenhouse Effect (returning)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (33, 5, 'Greenhouse Effect', '2026-06-20 20:30', '2026-06-20 21:15', 'Indie Pop', 'Fresh indie pop with spring vibes', 'https://greenhouseeffect.band');

-- The Daylight Thieves
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, genre, description, url)
VALUES (33, 1, 'The Daylight Thieves', '2026-06-20 21:30', '2026-06-20 22:15', 'Surf Rock', 'Summer surf rock vibes', 'https://daylightthieves.rocks');
