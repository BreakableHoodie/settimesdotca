-- SetTimes.ca - V2 Seed Data
-- Compatible with schema-final.sql (v2 schema)
-- Includes: Users, Venues, Events, Band Profiles, Performances

-- ============================================
-- 1. USERS (Admin)
-- ============================================
-- Password set during local seed (do not store plaintext here)
INSERT INTO users (id, email, password_hash, role, name, last_login) VALUES
(1, 'admin@settimes.ca', 'pbkdf2_sha256$260000$kPz3s...', 'admin', 'System Admin', datetime('now'));

-- ============================================
-- 2. VENUES
-- ============================================
INSERT INTO venues (id, name, address, city, capacity, website, created_by_user_id) VALUES
-- Ottawa
(1, 'Bronson Centre', '211 Bronson Ave', 'Ottawa', 800, 'https://bronsoncentre.ca', 1),
(2, 'The 27 Club', '27 York St', 'Ottawa', 300, 'https://the27.club', 1),
(3, 'House of TARG', '1077 Bank St', 'Ottawa', 150, 'https://houseoftarg.com', 1),
(4, 'Ritual Nightclub', '137 Besserer St', 'Ottawa', 600, 'https://ritualnightclub.com', 1),
(5, 'Live on Elgin', '220 Elgin St', 'Ottawa', 400, 'https://liveonelgin.com', 1),
-- Toronto
(6, 'Lee''s Palace', '529 Bloor St W', 'Toronto', 550, 'https://leespalace.com', 1),
(7, 'The Horseshoe Tavern', '370 Queen St W', 'Toronto', 400, 'https://horseshoetavern.com', 1),
(8, 'Velvet Underground', '508 Queen St W', 'Toronto', 300, 'https://thevelvet.ca', 1),
(9, 'The Phoenix Concert Theatre', '410 Sherbourne St', 'Toronto', 1350, 'https://thephoenixconcerttheatre.com', 1),
(10, 'The Drake Hotel', '1150 Queen St W', 'Toronto', 200, 'https://thedrake.ca', 1);

-- ============================================
-- 3. EVENTS
-- ============================================
INSERT INTO events (id, name, date, slug, is_published, description, city, ticket_url, created_by_user_id) VALUES
-- Past Events (2024)
(1, 'Winter Warm-Up 2024', '2024-01-20', 'winter-warm-up-2024', 1, 'Kick off the year with hot sounds on a cold night.', 'Ottawa', NULL, 1),
(2, 'Frost Fest 2024', '2024-02-17', 'frost-fest-2024', 1, 'Celebrate Winterlude with live music.', 'Ottawa', NULL, 1),
-- Current/Upcoming Events (2025)
(15, 'Winter Warm-Up 2025', '2025-01-18', 'winter-warm-up-2025', 1, 'Start 2025 right with blazing hot performances.', 'Ottawa', 'https://ticketscene.ca/winter-warmup-2025', 1),
(16, 'Frost Fest 2025', '2025-02-15', 'frost-fest-2025', 1, 'Winterlude''s musical companion.', 'Ottawa', 'https://ticketscene.ca/frost-fest-2025', 1),
(17, 'Spring Thaw 2025', '2025-03-22', 'spring-thaw-2025', 1, 'Emerging artists showcase as winter fades.', 'Toronto', 'https://ticketscene.ca/spring-thaw-2025', 1);

-- ============================================
-- 4. BAND PROFILES
-- ============================================
INSERT INTO band_profiles (id, name, name_normalized, genre, origin, description, created_by_user_id) VALUES
(1, 'The Frozen Hearts', 'the frozen hearts', 'Indie Rock', 'Ottawa', 'Local indie favorites bringing warmth to winter nights', 1),
(2, 'Snowblind', 'snowblind', 'Shoegaze', 'Toronto', 'Dreamy shoegaze perfect for cold evenings', 1),
(3, 'Arctic Monkeys Tribute', 'arctic monkeys tribute', 'Indie Rock', 'Montreal', 'Faithful tribute to the Sheffield legends', 1),
(4, 'The Mittens', 'the mittens', 'Folk Punk', 'Ottawa', 'Rowdy folk punk with a Canadian twist', 1),
(5, 'Frostbite', 'frostbite', 'Hardcore', 'Hamilton', 'Blistering hardcore from the Hammer', 1),
(6, 'Cabin Fever', 'cabin fever', 'Garage Rock', 'Kingston', 'Raw garage rock for the winter blues', 1),
(7, 'Northern Lights', 'northern lights', 'Electronic', 'Ottawa', 'Ambient electronic inspired by aurora borealis', 1),
(8, 'The Ice Fishers', 'the ice fishers', 'Folk', 'Ottawa', 'Traditional folk with modern sensibilities', 1),
(9, 'Blizzard Warning', 'blizzard warning', 'Post-Rock', 'Toronto', 'Epic instrumental post-rock soundscapes', 1),
(10, 'Hypothermia', 'hypothermia', 'Metal', 'Montreal', 'Cold, calculated metal assault', 1),
(11, 'Skating Rink', 'skating rink', 'Synth Pop', 'Ottawa', 'Retro synth pop with modern edge', 1),
(12, 'Snow Day', 'snow day', 'Pop Punk', 'Toronto', 'Nostalgic pop punk about winter memories', 1);

-- ============================================
-- 5. PERFORMANCES
-- ============================================
INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time, created_by_user_id) VALUES
-- Winter Warm-Up 2024 (Event 1)
(1, 1, 1, '19:00', '19:45', 1), -- The Frozen Hearts @ Bronson Centre
(1, 1, 2, '20:00', '20:45', 1), -- Snowblind @ Bronson Centre
(1, 1, 3, '21:00', '22:00', 1), -- Arctic Monkeys Tribute @ Bronson Centre
(1, 2, 4, '20:00', '20:45', 1), -- The Mittens @ The 27 Club
(1, 2, 5, '21:00', '21:45', 1), -- Frostbite @ The 27 Club
(1, 3, 6, '21:30', '22:15', 1), -- Cabin Fever @ House of TARG

-- Frost Fest 2024 (Event 2)
(2, 1, 7, '19:00', '19:45', 1), -- Northern Lights @ Bronson Centre
(2, 1, 8, '20:00', '20:45', 1), -- The Ice Fishers @ Bronson Centre
(2, 1, 9, '21:00', '22:00', 1), -- Blizzard Warning @ Bronson Centre
(2, 2, 10, '20:00', '20:45', 1), -- Hypothermia @ The 27 Club
(2, 2, 11, '21:00', '21:45', 1), -- Skating Rink @ The 27 Club
(2, 3, 12, '21:30', '22:15', 1); -- Snow Day @ House of TARG

-- Re-using bands for 2025 events (demonstrating reusable profiles)
INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time, created_by_user_id) VALUES
-- Winter Warm-Up 2025 (Event 15)
(15, 1, 1, '19:30', '20:15', 1), -- The Frozen Hearts return
(15, 1, 4, '20:30', '21:15', 1), -- The Mittens return
(15, 2, 6, '21:00', '21:45', 1), -- Cabin Fever returns

-- Frost Fest 2025 (Event 16)
(16, 1, 7, '20:00', '20:45', 1), -- Northern Lights return
(16, 2, 11, '21:00', '21:45', 1); -- Skating Rink returns
