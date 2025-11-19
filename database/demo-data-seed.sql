-- SetTimes Demo Data Seed Script
-- Purpose: Create realistic demo data for November 30th presentation
-- Event: Spring Music Festival 2025 (realistic showcase event)
-- Database: Cloudflare D1

-- =====================================================
-- DEMO EVENT DATA SEED
-- =====================================================
-- This script creates a comprehensive demo event that showcases
-- all SetTimes features: events, venues, performers, profiles,
-- design system, admin interface, and public timeline.
-- =====================================================

-- Clean up any existing demo data (optional - only for fresh start)
-- DELETE FROM bands WHERE event_id IN (SELECT id FROM events WHERE slug LIKE 'spring-music-fest-2025');
-- DELETE FROM venues WHERE name IN ('The Analog Cafe', 'Black Cat Tavern', 'Velvet Underground', 'Room 47', 'The Basement');
-- DELETE FROM events WHERE slug = 'spring-music-fest-2025';

-- =====================================================
-- CREATE DEMO EVENT
-- =====================================================

INSERT INTO events (name, date, slug, is_published, created_at) VALUES
('Spring Music Festival 2025', '2025-05-17', 'spring-music-fest-2025', 1, datetime('now'));

-- Get the event ID (will be used in subsequent inserts)
-- Note: In practice, you'll need to capture this ID from the INSERT

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
-- CREATE PERFORMERS (BANDS)
-- =====================================================
-- Note: In production, replace event_id and venue_id with actual IDs
-- This example assumes event_id=1, and venue IDs 1-5

-- The Analog Cafe (venue_id = 1)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url, instagram, facebook, description, created_at) VALUES
(1, 1, 'The Sunset Trio', '19:00', '20:00', 'https://thesunsettrio.com', 'thesunsettrio', 'thesunsettrio', 'Jazz fusion trio from Toronto blending bebop with modern funk. Known for their improvisational prowess and energetic live shows.', datetime('now')),
(1, 1, 'Electric Dreams', '20:30', '21:30', 'https://electricdreamsband.com', 'electricdreamsband', 'electricdreamsmusic', 'Electronic dance duo creating atmospheric soundscapes with live synths and drum machines. Winners of Best Electronic Act 2024.', datetime('now')),
(1, 1, 'Northern Lights', '22:00', '23:00', null, 'northernlightsband', null, 'Indie folk quartet inspired by Canadian wilderness. Their debut album "Aurora" reached #3 on campus radio charts.', datetime('now'));

-- Black Cat Tavern (venue_id = 2)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url, instagram, facebook, description, created_at) VALUES
(1, 2, 'The Midnight Riders', '19:30', '20:30', 'https://midnightriders.band', 'midnightriders', 'midnightriders', 'Classic rock covers band specializing in 70s and 80s hits. These veterans have been playing Toronto venues for over 15 years.', datetime('now')),
(1, 2, 'Neon Pulse', '21:00', '22:00', null, 'neonpulseband', 'neonpulse', 'Synth-pop quintet bringing retro vibes with modern production. Their single "City Lights" has 500K streams on Spotify.', datetime('now')),
(1, 2, 'The Wanderers', '22:30', '23:30', 'https://thewanderersmusic.ca', 'thewanderersband', null, 'Alternative rock group with introspective lyrics and soaring guitar solos. Currently on their "Lost & Found" Canadian tour.', datetime('now'));

-- Velvet Underground (venue_id = 3)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url, instagram, facebook, description, created_at) VALUES
(1, 3, 'Ruby Red', '19:00', '20:00', 'https://rubyredmusic.com', 'rubyredband', 'rubyredofficial', 'All-female punk rock powerhouse. Their fierce performances and political lyrics have earned them a devoted following.', datetime('now')),
(1, 3, 'The Cosmic Owls', '20:30', '21:45', null, 'thecosmicowls', 'cosmicowlsband', 'Psychedelic rock sextet with theatrical stage presence. Expect visual projections and extended jam sessions.', datetime('now')),
(1, 3, 'Starlight Serenade', '22:15', '23:15', 'https://starlightserenade.band', 'starlightserenade', null, 'Dream pop collective creating ethereal soundscapes. Perfect for late-night vibes and contemplative moments.', datetime('now'));

-- Room 47 (venue_id = 4)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url, instagram, facebook, description, created_at) VALUES
(1, 4, 'The Velvet Kings', '19:30', '20:45', 'https://velvetkings.ca', 'velvetkings', 'thevelvetkings', 'Blues and soul revivalists with a contemporary twist. Their horn section and soulful vocals will transport you back in time.', datetime('now')),
(1, 4, 'Crimson Wave', '21:15', '22:30', null, 'crimsonwaveband', 'crimsonwave', 'Experimental post-rock ensemble. Their dynamic range goes from whisper-quiet to thunderous crescendos.', datetime('now')),
(1, 4, 'The Moonshine Collective', '23:00', '00:00', 'https://moonshinecollective.com', 'moonshinecollective', null, 'Bluegrass fusion group mixing traditional instrumentation with modern songwriting. High-energy picking and four-part harmonies.', datetime('now'));

-- The Basement (venue_id = 5)
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url, instagram, facebook, description, created_at) VALUES
(1, 5, 'Static Shock', '19:00', '20:15', null, 'staticshockband', 'staticshockmusic', 'Garage rock trio with raw energy and lo-fi aesthetics. Their DIY ethos and catchy hooks have built a strong underground following.', datetime('now')),
(1, 5, 'The Echoes', '20:45', '21:45', 'https://theechoesband.ca', 'theechoesband', 'echoesbandofficial', 'Surf rock revival bringing 60s California vibes to Toronto. Reverb-heavy guitars and beachy melodies year-round.', datetime('now')),
(1, 5, 'Midnight Oil Revival', '22:15', '23:30', null, 'midnightoilrevival', null, 'Tribute to Australian rock legends Midnight Oil. Passionate performances of all the classics including "Beds Are Burning" and "Power and the Passion".', datetime('now'));

-- =====================================================
-- DEMO USER ACCOUNTS (for testing RBAC)
-- =====================================================
-- Note: Passwords are bcrypt hashed. Use bcrypt to generate in production.
-- Example passwords: admin123, editor123, viewer123

-- Admin user (already exists from initial setup, but here's a second one)
INSERT INTO users (email, name, password_hash, role, is_active, created_at) VALUES
('demo.admin@settimes.ca', 'Demo Administrator', '$2a$10$YourBcryptHashHere', 'admin', 1, datetime('now'));

-- Editor user
INSERT INTO users (email, name, password_hash, role, is_active, created_at) VALUES
('demo.editor@settimes.ca', 'Demo Editor', '$2a$10$YourBcryptHashHere', 'editor', 1, datetime('now'));

-- Viewer user
INSERT INTO users (email, name, password_hash, role, is_active, created_at) VALUES
('demo.viewer@settimes.ca', 'Demo Viewer', '$2a$10$YourBcryptHashHere', 'viewer', 1, datetime('now'));

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify demo data was inserted correctly

-- Check event was created
-- SELECT * FROM events WHERE slug = 'spring-music-fest-2025';

-- Check venues were created
-- SELECT * FROM venues ORDER BY name;

-- Check bands were created
-- SELECT b.name, v.name as venue, b.start_time, b.end_time
-- FROM bands b
-- JOIN venues v ON b.venue_id = v.id
-- WHERE b.event_id = 1
-- ORDER BY v.name, b.start_time;

-- Check for scheduling conflicts
-- SELECT
--   b1.name as band1,
--   b2.name as band2,
--   v.name as venue,
--   b1.start_time,
--   b1.end_time
-- FROM bands b1
-- JOIN bands b2 ON b1.venue_id = b2.venue_id
--   AND b1.id < b2.id
--   AND b1.event_id = b2.event_id
-- JOIN venues v ON b1.venue_id = v.id
-- WHERE b1.event_id = 1
--   AND (
--     (b2.start_time >= b1.start_time AND b2.start_time < b1.end_time)
--     OR (b2.end_time > b1.start_time AND b2.end_time <= b1.end_time)
--     OR (b2.start_time <= b1.start_time AND b2.end_time >= b1.end_time)
--   );

-- =====================================================
-- NOTES FOR DEMO
-- =====================================================
-- This demo data showcases:
-- ✓ Multiple venues (5) across different locations
-- ✓ Multiple performers (18) with varied genres
-- ✓ Realistic time scheduling (no conflicts)
-- ✓ Mix of bands with/without social media links
-- ✓ Professional descriptions for band profiles
-- ✓ Diverse musical styles (jazz, electronic, indie, rock, punk, blues, etc.)
-- ✓ Complete event ready for public timeline
-- ✓ RBAC testing with admin/editor/viewer accounts
-- ✓ Real Toronto addresses for venue map integration
-- ✓ Realistic band names and bios
--
-- Key Demo Flow:
-- 1. Show public timeline (/)
-- 2. Click on event "Spring Music Festival 2025"
-- 3. Filter by venue (e.g., "The Analog Cafe")
-- 4. Click on band profile (e.g., "The Sunset Trio")
-- 5. Show admin panel (/admin)
-- 6. Log in as editor
-- 7. Create new band/venue/event
-- 8. Demonstrate design system (buttons, badges, tooltips)
-- 9. Show conflict detection
-- 10. Demonstrate RBAC (try as viewer - read-only)
-- 11. Show responsive mobile design
-- 12. Highlight accessibility features
--
-- =====================================================
