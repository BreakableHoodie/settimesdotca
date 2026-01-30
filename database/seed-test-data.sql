-- Test Data: Full Year of Events, Venues, and Bands
-- Run with: npx wrangler d1 execute DB --local --file=database/seed-test-data.sql

-- ============================================
-- VENUES (20 venues across different cities)
-- ============================================

INSERT OR REPLACE INTO venues (id, name, address, city, capacity, website) VALUES
-- Ottawa venues
(1, 'Bronson Centre', '211 Bronson Ave', 'Ottawa', 800, 'https://bronsoncentre.ca'),
(2, 'The 27 Club', '27 York St', 'Ottawa', 300, 'https://the27.club'),
(3, 'House of TARG', '1077 Bank St', 'Ottawa', 150, 'https://houseoftarg.com'),
(4, 'Ritual Nightclub', '137 Besserer St', 'Ottawa', 600, 'https://ritualnightclub.com'),
(5, 'Live on Elgin', '220 Elgin St', 'Ottawa', 400, 'https://liveonelgin.com'),
-- Toronto venues
(6, 'Lee''s Palace', '529 Bloor St W', 'Toronto', 550, 'https://leespalace.com'),
(7, 'The Horseshoe Tavern', '370 Queen St W', 'Toronto', 400, 'https://horseshoetavern.com'),
(8, 'Velvet Underground', '508 Queen St W', 'Toronto', 300, 'https://thevelvet.ca'),
(9, 'The Phoenix Concert Theatre', '410 Sherbourne St', 'Toronto', 1350, 'https://thephoenixconcerttheatre.com'),
(10, 'The Drake Hotel', '1150 Queen St W', 'Toronto', 200, 'https://thedrake.ca'),
-- Montreal venues
(11, 'Casa del Popolo', '4873 St Laurent Blvd', 'Montreal', 150, 'https://casadelpopolo.com'),
(12, 'Bar Le Ritz PDB', '179 Jean-Talon W', 'Montreal', 200, 'https://barleritzpdb.com'),
(13, 'L''Astral', '305 Ste-Catherine St W', 'Montreal', 500, 'https://sallelastral.com'),
(14, 'Foufounes Électriques', '87 Ste-Catherine St E', 'Montreal', 400, 'https://foufritz.com'),
(15, 'Le National', '1220 Ste-Catherine St E', 'Montreal', 900, 'https://lenational.ca'),
-- Other cities
(16, 'Call the Office', '216 York St', 'London', 300, 'https://calltheoffice.com'),
(17, 'This Ain''t Hollywood', '345 James St N', 'Hamilton', 250, 'https://thisainthollywood.ca'),
(18, 'The Mansion', '506 Princess St', 'Kingston', 400, 'https://themansionkingston.com'),
(19, 'Maxwell''s Concerts', '35 University Ave E', 'Waterloo', 350, 'https://maxwellswaterloo.ca'),
(20, 'Rum Runners', '178 Dundas St', 'London', 500, 'https://rumrunners.com');

-- ============================================
-- EVENTS (12 monthly events + special events)
-- ============================================

INSERT OR REPLACE INTO events (id, name, date, slug, is_published, status, description, city, ticket_url) VALUES
-- Past events (for testing past events display)
(1, 'Winter Warm-Up 2024', '2024-01-20', 'winter-warm-up-2024', 1, 'published', 'Kick off the year with hot sounds on a cold night. Multi-venue indoor festival featuring 30+ local and touring acts.', 'Ottawa', NULL),
(2, 'Frost Fest 2024', '2024-02-17', 'frost-fest-2024', 1, 'published', 'Celebrate Winterlude with live music across downtown venues. Three nights of folk, rock, and electronic performances.', 'Ottawa', NULL),
(3, 'Spring Thaw Festival', '2024-03-23', 'spring-thaw-2024', 1, 'published', 'As the ice melts, the music heats up. Showcasing emerging Canadian talent.', 'Toronto', NULL),
(4, 'April Amplified', '2024-04-13', 'april-amplified-2024', 1, 'published', 'A celebration of loud guitars and louder drums. All-ages punk and metal showcase.', 'Montreal', NULL),
(5, 'Tulip Tunes Festival', '2024-05-18', 'tulip-tunes-2024', 1, 'published', 'Music blooms during tulip season. Outdoor and indoor performances celebrating spring.', 'Ottawa', NULL),
(6, 'Summer Solstice Sessions', '2024-06-21', 'summer-solstice-2024', 1, 'published', 'The longest day deserves the longest party. 12 hours of continuous music.', 'Toronto', NULL),
(7, 'Canada Day Rock Fest', '2024-07-01', 'canada-day-2024', 1, 'published', 'Celebrate Canada with homegrown rock and roll. Free outdoor stages plus ticketed evening shows.', 'Ottawa', NULL),
(8, 'August Heat Wave', '2024-08-10', 'august-heat-2024', 1, 'published', 'The hottest bands for the hottest month. Dance music, hip-hop, and R&B showcase.', 'Montreal', NULL),
(9, 'Labour Day Loud', '2024-09-02', 'labour-day-2024', 1, 'published', 'Send off summer with a bang. Two days of punk, hardcore, and metal.', 'Hamilton', NULL),
(10, 'Autumn Acoustics', '2024-10-12', 'autumn-acoustics-2024', 1, 'published', 'Intimate acoustic performances as leaves change color. Folk, singer-songwriter, and jazz.', 'Kingston', NULL),
(11, 'Halloween Havoc', '2024-10-31', 'halloween-havoc-2024', 1, 'published', 'Costumes encouraged! Dark wave, goth, and spooky sounds all night long.', 'Toronto', NULL),

-- Current/Upcoming events
(12, 'November Noise Fest', '2024-11-16', 'november-noise-2024', 1, 'published', 'Experimental, noise, and avant-garde music festival. Push your sonic boundaries.', 'Montreal', 'https://ticketscene.ca/november-noise'),
(13, 'Holiday Hootenanny 2024', '2024-12-14', 'holiday-hootenanny-2024', 1, 'published', 'Annual holiday party with local favorites. Ugly sweaters welcome!', 'Ottawa', 'https://ticketscene.ca/holiday-2024'),
(14, 'New Year''s Eve Bash 2024', '2024-12-31', 'nye-2024', 1, 'published', 'Ring in 2025 with multiple stages of live music. Countdown to midnight with Canada''s best.', 'Toronto', 'https://ticketscene.ca/nye-2024'),

-- 2025 Events
(15, 'Winter Warm-Up 2025', '2025-01-18', 'winter-warm-up-2025', 1, 'published', 'Start 2025 right with blazing hot performances. Multi-venue winter festival returns.', 'Ottawa', 'https://ticketscene.ca/winter-warmup-2025'),
(16, 'Frost Fest 2025', '2025-02-15', 'frost-fest-2025', 1, 'published', 'Winterlude''s musical companion. Three venues, 40 bands, one cold weekend.', 'Ottawa', 'https://ticketscene.ca/frost-fest-2025'),
(17, 'Spring Thaw 2025', '2025-03-22', 'spring-thaw-2025', 1, 'published', 'Emerging artists showcase as winter fades. Indie rock, folk, and electronica.', 'Toronto', 'https://ticketscene.ca/spring-thaw-2025'),
(18, 'April Amplified 2025', '2025-04-12', 'april-amplified-2025', 1, 'published', 'Heavy music for heavy times. Punk, metal, hardcore celebration.', 'Montreal', 'https://ticketscene.ca/april-amp-2025'),
(19, 'Tulip Tunes 2025', '2025-05-17', 'tulip-tunes-2025', 1, 'published', 'Music festival during Ottawa''s famous tulip festival. Garden party vibes.', 'Ottawa', 'https://ticketscene.ca/tulip-2025'),
(20, 'Summer Solstice 2025', '2025-06-21', 'summer-solstice-2025', 1, 'published', 'Longest day, biggest party. Noon to midnight music marathon.', 'Toronto', 'https://ticketscene.ca/solstice-2025'),
(21, 'Canada Day Festival 2025', '2025-07-01', 'canada-day-2025', 1, 'published', 'Celebrate Canada with live music on Parliament Hill and beyond.', 'Ottawa', 'https://ticketscene.ca/canada-day-2025'),
(22, 'August Heat Wave 2025', '2025-08-09', 'august-heat-2025', 1, 'published', 'Summer''s peak brings peak performances. Dance all night under the stars.', 'Montreal', 'https://ticketscene.ca/august-heat-2025'),
(23, 'Labour Day Loud 2025', '2025-09-01', 'labour-day-2025', 1, 'published', 'End of summer blowout. Three days of loud, fast music.', 'Hamilton', 'https://ticketscene.ca/labour-loud-2025'),
(24, 'Autumn Acoustics 2025', '2025-10-11', 'autumn-acoustics-2025', 1, 'published', 'Cozy acoustic shows as leaves turn. Intimate venues, big talent.', 'Kingston', 'https://ticketscene.ca/autumn-2025'),
(25, 'Halloween Havoc 2025', '2025-10-31', 'halloween-havoc-2025', 1, 'published', 'Spooky season''s biggest party. Dark sounds, darker costumes.', 'Toronto', 'https://ticketscene.ca/halloween-2025'),
(26, 'November Noise 2025', '2025-11-15', 'november-noise-2025', 1, 'published', 'Experimental music festival. Noise, drone, ambient, and beyond.', 'Montreal', 'https://ticketscene.ca/noise-2025'),
(27, 'Holiday Hootenanny 2025', '2025-12-13', 'holiday-hootenanny-2025', 1, 'published', 'Annual holiday celebration with community favorites.', 'Ottawa', 'https://ticketscene.ca/holiday-2025');

-- ============================================
-- BANDS (150+ bands across all events)
-- ============================================

-- Winter Warm-Up 2024 (Event 1) - Past
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(1, 1, 1, 'The Frozen Hearts', '19:00', '19:45', 'Indie Rock', 'Ottawa', 'Local indie favorites bringing warmth to winter nights'),
(2, 1, 1, 'Snowblind', '20:00', '20:45', 'Shoegaze', 'Toronto', 'Dreamy shoegaze perfect for cold evenings'),
(3, 1, 1, 'Arctic Monkeys Tribute', '21:00', '22:00', 'Indie Rock', 'Montreal', 'Faithful tribute to the Sheffield legends'),
(4, 1, 2, 'The Mittens', '20:00', '20:45', 'Folk Punk', 'Ottawa', 'Rowdy folk punk with a Canadian twist'),
(5, 1, 2, 'Frostbite', '21:00', '21:45', 'Hardcore', 'Hamilton', 'Blistering hardcore from the Hammer'),
(6, 1, 3, 'Cabin Fever', '21:30', '22:15', 'Garage Rock', 'Kingston', 'Raw garage rock for the winter blues');

-- Frost Fest 2024 (Event 2) - Past
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(7, 2, 1, 'Northern Lights', '19:00', '19:45', 'Electronic', 'Ottawa', 'Ambient electronic inspired by aurora borealis'),
(8, 2, 1, 'The Ice Fishers', '20:00', '20:45', 'Folk', 'Ottawa', 'Traditional folk with modern sensibilities'),
(9, 2, 1, 'Blizzard Warning', '21:00', '22:00', 'Post-Rock', 'Toronto', 'Epic instrumental post-rock soundscapes'),
(10, 2, 2, 'Hypothermia', '20:00', '20:45', 'Metal', 'Montreal', 'Cold, calculated metal assault'),
(11, 2, 2, 'Skating Rink', '21:00', '21:45', 'Synth Pop', 'Ottawa', 'Retro synth pop with modern edge'),
(12, 2, 3, 'Snow Day', '21:30', '22:15', 'Pop Punk', 'Toronto', 'Nostalgic pop punk about winter memories');

-- Spring Thaw 2024 (Event 3) - Past
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(13, 3, 6, 'Melting Point', '19:00', '19:45', 'Indie Pop', 'Toronto', 'Bright indie pop for sunny days ahead'),
(14, 3, 6, 'The Puddles', '20:00', '20:45', 'Garage Rock', 'Hamilton', 'Splashy garage rock from the Hammer'),
(15, 3, 6, 'First Bloom', '21:00', '22:00', 'Dream Pop', 'Montreal', 'Ethereal dream pop like spring flowers'),
(16, 3, 7, 'Mud Season', '20:00', '20:45', 'Alt Country', 'Kingston', 'Gritty alternative country'),
(17, 3, 7, 'April Showers', '21:00', '21:45', 'Emo', 'Toronto', 'Emotional rock for rainy afternoons'),
(18, 3, 8, 'The Robins', '21:30', '22:15', 'Folk Rock', 'Ottawa', 'Cheerful folk rock heralding spring');

-- Canada Day 2024 (Event 7) - Past
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(19, 7, 1, 'True North', '12:00', '12:45', 'Rock', 'Ottawa', 'Canadian rock anthems for Canada Day'),
(20, 7, 1, 'Maple Leaf Rag', '13:00', '13:45', 'Jazz', 'Toronto', 'Swinging jazz with Canadian flair'),
(21, 7, 1, 'The Canadians', '14:00', '14:45', 'Pop Rock', 'Vancouver', 'Catchy pop rock celebrating home'),
(22, 7, 1, 'Northern Soul', '15:00', '15:45', 'Soul', 'Montreal', 'Canadian soul and R&B'),
(23, 7, 1, 'Parliament Funk', '16:00', '16:45', 'Funk', 'Ottawa', 'Funky grooves from the capital'),
(24, 7, 1, 'Confederation', '17:00', '18:00', 'Prog Rock', 'Toronto', 'Epic prog rock about Canadian history'),
(25, 7, 2, 'Beaver Tales', '19:00', '19:45', 'Folk Punk', 'Ottawa', 'Raucous folk punk'),
(26, 7, 2, 'The Loons', '20:00', '20:45', 'Indie Rock', 'Muskoka', 'Cottage country indie rock'),
(27, 7, 2, 'Mounties', '21:00', '22:00', 'Alt Rock', 'Calgary', 'Hard-driving alternative rock'),
(28, 7, 3, 'Poutine', '20:00', '20:45', 'Punk', 'Montreal', 'Messy, delicious punk rock'),
(29, 7, 3, 'Timbits', '21:00', '21:45', 'Pop Punk', 'Ottawa', 'Sweet pop punk treats'),
(30, 7, 4, 'The Hockey Fighters', '22:00', '23:00', 'Hardcore', 'Toronto', 'Hard-hitting hardcore');

-- Halloween Havoc 2024 (Event 11) - Past
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(31, 11, 6, 'Graveyard Shift', '20:00', '20:45', 'Goth Rock', 'Toronto', 'Classic goth rock revivalists'),
(32, 11, 6, 'The Specters', '21:00', '21:45', 'Post-Punk', 'Montreal', 'Haunting post-punk atmospherics'),
(33, 11, 6, 'Witch House', '22:00', '23:00', 'Dark Electronic', 'Toronto', 'Spooky electronic soundscapes'),
(34, 11, 7, 'Skeleton Crew', '20:00', '20:45', 'Death Rock', 'Hamilton', 'Bone-rattling death rock'),
(35, 11, 7, 'The Haunted', '21:00', '21:45', 'Doom Metal', 'Ottawa', 'Crushing doom for All Hallows Eve'),
(36, 11, 8, 'Vampire Weekend Tribute', '22:00', '23:00', 'Indie Pop', 'Toronto', 'Celebrating the band, not the holiday');

-- Holiday Hootenanny 2024 (Event 13) - Current/Near Future
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(37, 13, 1, 'The Carolers', '19:00', '19:45', 'Folk', 'Ottawa', 'Traditional holiday folk songs with a twist'),
(38, 13, 1, 'Jingle Punks', '20:00', '20:45', 'Punk', 'Toronto', 'Punk rock holiday classics'),
(39, 13, 1, 'Silent Night Owl', '21:00', '22:00', 'Indie Rock', 'Montreal', 'Mellow indie rock for the season'),
(40, 13, 2, 'Nutcracker Suite', '20:00', '20:45', 'Electronic', 'Ottawa', 'Electronic reinterpretations of classics'),
(41, 13, 2, 'Figgy Pudding', '21:00', '21:45', 'Garage Rock', 'Kingston', 'Messy, fun garage rock'),
(42, 13, 3, 'The Grinches', '21:30', '22:15', 'Hardcore', 'Hamilton', 'Anti-holiday hardcore anthems');

-- Winter Warm-Up 2025 (Event 15)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(43, 15, 1, 'Polar Vortex', '19:00', '19:45', 'Noise Rock', 'Ottawa', 'Swirling noise rock chaos'),
(44, 15, 1, 'The Snowsqualls', '20:00', '20:45', 'Indie Rock', 'Toronto', 'Blustery indie rock anthems'),
(45, 15, 1, 'Hibernation Station', '21:00', '22:00', 'Slowcore', 'Montreal', 'Slow, dreamy winter soundscapes'),
(46, 15, 2, 'Ice Storm', '20:00', '20:45', 'Metal', 'Ottawa', 'Cold, crushing metal'),
(47, 15, 2, 'The Parkas', '21:00', '21:45', 'Post-Punk', 'Hamilton', 'Bundled-up post-punk'),
(48, 15, 3, 'Hot Cocoa', '21:30', '22:15', 'Indie Pop', 'Kingston', 'Warm, sweet indie pop'),
(49, 15, 4, 'Snowmobile', '22:00', '23:00', 'Electronic', 'Toronto', 'High-speed electronic music'),
(50, 15, 5, 'The Toques', '20:00', '20:45', 'Folk Punk', 'Ottawa', 'Knit-cap wearing folk punks');

-- Frost Fest 2025 (Event 16)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(51, 16, 1, 'Crystal Palace', '19:00', '19:45', 'Synth Pop', 'Ottawa', 'Icy synth pop perfection'),
(52, 16, 1, 'The Flurries', '20:00', '20:45', 'Dream Pop', 'Toronto', 'Soft, swirling dream pop'),
(53, 16, 1, 'Permafrost', '21:00', '22:00', 'Post-Metal', 'Montreal', 'Frozen, heavy post-metal'),
(54, 16, 2, 'Ski Lodge', '20:00', '20:45', 'Indie Folk', 'Ottawa', 'Cozy cabin folk music'),
(55, 16, 2, 'Black Ice', '21:00', '21:45', 'Punk', 'Hamilton', 'Dangerous, slick punk'),
(56, 16, 3, 'The Snowbirds', '21:30', '22:15', 'Country', 'Calgary', 'Canadian country from out west'),
(57, 16, 4, 'Ice Rink DJs', '22:00', '01:00', 'House', 'Toronto', 'Late night dance party'),
(58, 16, 5, 'Maple Syrup', '20:00', '20:45', 'Funk', 'Montreal', 'Sweet, sticky funk grooves');

-- Tulip Tunes 2025 (Event 19)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(59, 19, 1, 'The Petals', '14:00', '14:45', 'Indie Pop', 'Ottawa', 'Bright, colorful indie pop'),
(60, 19, 1, 'Garden Party', '15:00', '15:45', 'Jazz', 'Toronto', 'Sophisticated garden party jazz'),
(61, 19, 1, 'Photosynthesis', '16:00', '16:45', 'Psych Rock', 'Montreal', 'Sun-soaked psychedelic rock'),
(62, 19, 1, 'The Pollinators', '17:00', '17:45', 'Folk Rock', 'Ottawa', 'Buzzworthy folk rock'),
(63, 19, 1, 'Dutch Masters', '18:00', '19:00', 'Progressive Rock', 'Amsterdam', 'Visiting Dutch prog rock masters'),
(64, 19, 2, 'Greenhouse Effect', '19:00', '19:45', 'Electronic', 'Vancouver', 'Ambient electronic ecosystems'),
(65, 19, 2, 'The Butterflies', '20:00', '20:45', 'Dream Pop', 'Toronto', 'Delicate, floating dream pop'),
(66, 19, 2, 'Compost Heap', '21:00', '21:45', 'Noise Rock', 'Hamilton', 'Decomposing noise rock chaos'),
(67, 19, 3, 'Dandelion Wine', '20:00', '20:45', 'Folk', 'Ottawa', 'Homemade folk music'),
(68, 19, 3, 'The Sprouts', '21:00', '21:45', 'Pop Punk', 'Kingston', 'Fresh pop punk energy');

-- Summer Solstice 2025 (Event 20)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(69, 20, 6, 'High Noon', '12:00', '12:45', 'Country Rock', 'Calgary', 'Blazing country rock'),
(70, 20, 6, 'Sun Stroke', '13:00', '13:45', 'Funk', 'Toronto', 'Hot, sweaty funk grooves'),
(71, 20, 6, 'Solar Flare', '14:00', '14:45', 'Psych Rock', 'Austin', 'Texas psych rock heat wave'),
(72, 20, 6, 'The Sundials', '15:00', '15:45', 'Indie Rock', 'Toronto', 'Timeless indie rock'),
(73, 20, 6, 'Heatwave', '16:00', '16:45', 'Disco', 'Montreal', 'Retro disco revival'),
(74, 20, 6, 'Summer Camp', '17:00', '17:45', 'Pop Punk', 'Ottawa', 'Nostalgic summer pop punk'),
(75, 20, 6, 'The Longest Day', '18:00', '19:00', 'Post-Rock', 'Toronto', 'Epic instrumental journey'),
(76, 20, 7, 'Bonfire', '19:00', '19:45', 'Folk Punk', 'Hamilton', 'Campfire folk punk'),
(77, 20, 7, 'Night Swim', '20:00', '20:45', 'Synth Pop', 'Vancouver', 'Cool synth pop relief'),
(78, 20, 7, 'Midnight Sun', '21:00', '22:00', 'Shoegaze', 'Montreal', 'Bright, endless shoegaze'),
(79, 20, 8, 'The Fireflies', '22:00', '22:45', 'Dream Pop', 'Toronto', 'Glowing dream pop'),
(80, 20, 8, 'After Dark', '23:00', '00:00', 'Electronic', 'Berlin', 'German electronic headliner');

-- Canada Day 2025 (Event 21)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(81, 21, 1, 'O Canada', '12:00', '12:45', 'Folk', 'Ottawa', 'Patriotic folk anthems'),
(82, 21, 1, 'Red & White', '13:00', '13:45', 'Pop Rock', 'Toronto', 'Celebratory pop rock'),
(83, 21, 1, 'The Territories', '14:00', '14:45', 'Indie Rock', 'Yellowknife', 'Northern indie rock'),
(84, 21, 1, 'Dominion', '15:00', '15:45', 'Metal', 'Vancouver', 'Heavy Canadian metal'),
(85, 21, 1, 'Heritage Minute', '16:00', '16:45', 'Post-Punk', 'Winnipeg', 'Prairie post-punk'),
(86, 21, 1, 'The Voyageurs', '17:00', '18:00', 'Folk Rock', 'Montreal', 'Historical folk rock journey'),
(87, 21, 2, 'Centennial', '19:00', '19:45', 'Jazz', 'Toronto', 'Canadian jazz standards'),
(88, 21, 2, 'Coast to Coast', '20:00', '20:45', 'Alt Rock', 'Halifax', 'East coast alternative rock'),
(89, 21, 2, 'Arctic Circle', '21:00', '22:00', 'Electronic', 'Iqaluit', 'Northern electronic sounds'),
(90, 21, 3, 'Confederation Bridge', '20:00', '20:45', 'Punk', 'Charlottetown', 'Maritime punk'),
(91, 21, 3, 'The Maple Leafs', '21:00', '21:45', 'Ska', 'Toronto', 'Upstroke ska celebration'),
(92, 21, 4, 'Fireworks', '22:00', '23:30', 'Electronic', 'Montreal', 'Explosive electronic finale');

-- August Heat Wave 2025 (Event 22)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(93, 22, 11, 'Les Chaleurs', '19:00', '19:45', 'Indie Rock', 'Montreal', 'Montreal indie rock heat'),
(94, 22, 11, 'Canicule', '20:00', '20:45', 'Electronic', 'Paris', 'French electronic visitors'),
(95, 22, 11, 'Tropique', '21:00', '22:00', 'World Music', 'Montreal', 'Tropical world fusion'),
(96, 22, 12, 'The Humid Ones', '20:00', '20:45', 'Soul', 'Detroit', 'Sweaty Detroit soul'),
(97, 22, 12, 'AC/DC Tribute', '21:00', '22:00', 'Hard Rock', 'Toronto', 'High voltage tribute'),
(98, 22, 13, 'Summer Thunder', '20:00', '20:45', 'Metal', 'Montreal', 'Stormy metal assault'),
(99, 22, 13, 'Hot Flash', '21:00', '21:45', 'Punk', 'Ottawa', 'Fast, sweaty punk'),
(100, 22, 13, 'The BBQ Boys', '22:00', '23:00', 'Country', 'Nashville', 'Smoky country rock'),
(101, 22, 14, 'Patio Weather', '22:00', '23:30', 'House', 'Ibiza', 'Late night house party');

-- Halloween Havoc 2025 (Event 25)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(102, 25, 6, 'The Undead', '20:00', '20:45', 'Punk', 'Toronto', 'Zombie punk chaos'),
(103, 25, 6, 'Crypt Keeper', '21:00', '21:45', 'Death Metal', 'Montreal', 'Tales from the crypt'),
(104, 25, 6, 'Full Moon', '22:00', '22:45', 'Goth Rock', 'London UK', 'British goth legends'),
(105, 25, 6, 'The Witching Hour', '23:00', '00:00', 'Dark Wave', 'Toronto', 'Midnight dark wave'),
(106, 25, 7, 'Jack O Lantern', '20:00', '20:45', 'Garage Rock', 'Hamilton', 'Carved-up garage rock'),
(107, 25, 7, 'Monster Mash-Up', '21:00', '21:45', 'Mashup DJ', 'Ottawa', 'Halloween mashup party'),
(108, 25, 7, 'The Creatures', '22:00', '23:00', 'Post-Punk', 'Vancouver', 'Creepy post-punk'),
(109, 25, 8, 'Nightmare', '22:00', '22:45', 'Industrial', 'Toronto', 'Industrial horror soundtrack'),
(110, 25, 8, 'The Black Cats', '23:00', '00:00', 'Rockabilly', 'Memphis', 'Spooky rockabilly'),
(111, 25, 9, 'Dawn of the Dead', '00:00', '01:00', 'Hardcore', 'Montreal', 'Zombie hardcore til dawn');

-- Autumn Acoustics 2025 (Event 24)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(112, 24, 18, 'Falling Leaves', '19:00', '19:45', 'Folk', 'Kingston', 'Gentle autumn folk'),
(113, 24, 18, 'The Harvest', '20:00', '20:45', 'Bluegrass', 'Kentucky', 'American bluegrass'),
(114, 24, 18, 'October Rust', '21:00', '22:00', 'Acoustic Rock', 'Toronto', 'Rustic acoustic rock'),
(115, 24, 18, 'The Sweaters', '20:00', '20:45', 'Indie Folk', 'Montreal', 'Cozy indie folk'),
(116, 24, 18, 'Cider House', '21:00', '21:45', 'Jazz', 'Ottawa', 'Warm jazz for cool nights'),
(117, 24, 18, 'Bonfire Stories', '22:00', '23:00', 'Singer-Songwriter', 'Halifax', 'Maritime storytelling');

-- November Noise 2025 (Event 26)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(118, 26, 11, 'Static Void', '19:00', '19:45', 'Noise', 'Montreal', 'Pure noise assault'),
(119, 26, 11, 'The Drones', '20:00', '20:45', 'Drone', 'Toronto', 'Meditative drone music'),
(120, 26, 11, 'Frequency Shift', '21:00', '22:00', 'Experimental', 'Berlin', 'German experimental electronics'),
(121, 26, 12, 'Tape Hiss', '20:00', '20:45', 'Lo-Fi', 'Ottawa', 'Degraded lo-fi aesthetics'),
(122, 26, 12, 'The Oscillators', '21:00', '21:45', 'Modular Synth', 'Vancouver', 'Modular synth exploration'),
(123, 26, 13, 'White Noise', '20:00', '20:45', 'Harsh Noise', 'Tokyo', 'Japanese harsh noise'),
(124, 26, 13, 'Feedback Loop', '21:00', '21:45', 'Noise Rock', 'Chicago', 'Chicago noise rock'),
(125, 26, 13, 'The Minimalists', '22:00', '23:00', 'Minimal', 'New York', 'NYC minimal composition');

-- Holiday Hootenanny 2025 (Event 27)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(126, 27, 1, 'Yuletide', '19:00', '19:45', 'Folk', 'Ottawa', 'Traditional holiday folk'),
(127, 27, 1, 'The Ornaments', '20:00', '20:45', 'Indie Pop', 'Toronto', 'Decorative indie pop'),
(128, 27, 1, 'Sugarplum', '21:00', '22:00', 'Electronic', 'Montreal', 'Sweet electronic dreams'),
(129, 27, 2, 'Coal Mine', '20:00', '20:45', 'Blues', 'Chicago', 'Naughty list blues'),
(130, 27, 2, 'The Elves', '21:00', '21:45', 'Pop Punk', 'Ottawa', 'Tiny pop punk energy'),
(131, 27, 3, 'Krampus', '21:30', '22:15', 'Metal', 'Vienna', 'Austrian holiday metal'),
(132, 27, 4, 'Midnight Clear', '22:00', '23:00', 'Jazz', 'New Orleans', 'New Orleans holiday jazz'),
(133, 27, 5, 'The Gift', '20:00', '20:45', 'Singer-Songwriter', 'Ottawa', 'Heartfelt holiday songs');

-- Add more bands to April Amplified 2025 (Event 18) for variety
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(134, 18, 11, 'Amplifier', '19:00', '19:45', 'Stoner Rock', 'Montreal', 'Heavy stoner grooves'),
(135, 18, 11, 'The Decibels', '20:00', '20:45', 'Punk', 'Ottawa', 'Loud, fast punk'),
(136, 18, 11, 'Maximum Volume', '21:00', '22:00', 'Metal', 'Toronto', 'Cranked-up metal'),
(137, 18, 12, 'Distortion Pedal', '20:00', '20:45', 'Noise Rock', 'Hamilton', 'Fuzzy noise rock'),
(138, 18, 12, 'The Amps', '21:00', '21:45', 'Hardcore', 'Montreal', 'Full-stack hardcore'),
(139, 18, 13, 'Feedback', '20:00', '20:45', 'Shoegaze', 'Toronto', 'Wall of sound shoegaze'),
(140, 18, 13, 'The Stacks', '21:00', '21:45', 'Post-Metal', 'Vancouver', 'Towering post-metal'),
(141, 18, 13, 'Speaker Blow', '22:00', '23:00', 'Industrial', 'Chicago', 'Industrial assault'),
(142, 18, 14, 'The Wattage', '22:00', '23:30', 'Electronic', 'Berlin', 'Powered electronic');

-- Labour Day Loud 2025 (Event 23)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(143, 23, 17, 'Working Class', '14:00', '14:45', 'Punk', 'Hamilton', 'Blue collar punk'),
(144, 23, 17, 'The Unions', '15:00', '15:45', 'Hardcore', 'Detroit', 'Motor city hardcore'),
(145, 23, 17, 'Labour Force', '16:00', '16:45', 'Metal', 'Pittsburgh', 'Steel city metal'),
(146, 23, 17, 'Nine to Five', '17:00', '17:45', 'Post-Punk', 'Toronto', 'Office drone post-punk'),
(147, 23, 17, 'Overtime', '18:00', '19:00', 'Noise Rock', 'Chicago', 'Extended noise rock'),
(148, 23, 17, 'The Grinders', '19:00', '19:45', 'Sludge', 'New Orleans', 'Heavy sludge metal'),
(149, 23, 17, 'Punch Clock', '20:00', '20:45', 'Punk', 'Ottawa', 'Time-keeping punk'),
(150, 23, 17, 'End of Shift', '21:00', '22:00', 'Hardcore', 'Montreal', 'Closing time hardcore');

-- Update sqlite_sequence if needed
DELETE FROM sqlite_sequence WHERE name IN ('venues', 'events', 'bands');
INSERT INTO sqlite_sequence (name, seq) VALUES ('venues', 20), ('events', 27), ('bands', 150);
