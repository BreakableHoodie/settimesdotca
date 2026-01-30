-- Test Data: 2026 Events and Bands
-- Run with: sqlite3 <database-file> < database/seed-2026-data.sql

-- ============================================
-- 2026 EVENTS (12 monthly events)
-- ============================================

INSERT OR REPLACE INTO events (id, name, date, slug, is_published, status, description, city, ticket_url) VALUES
(28, 'Winter Warm-Up 2026', '2026-01-17', 'winter-warm-up-2026', 1, 'published', 'Annual winter festival returns for its third year. Bigger, louder, warmer.', 'Ottawa', 'https://ticketscene.ca/winter-warmup-2026'),
(29, 'Frost Fest 2026', '2026-02-14', 'frost-fest-2026', 1, 'published', 'Valentine''s weekend meets Winterlude. Love and music in the cold.', 'Ottawa', 'https://ticketscene.ca/frost-fest-2026'),
(30, 'Spring Thaw 2026', '2026-03-21', 'spring-thaw-2026', 1, 'published', 'First day of spring celebration. New beginnings, new sounds.', 'Toronto', 'https://ticketscene.ca/spring-thaw-2026'),
(31, 'April Amplified 2026', '2026-04-11', 'april-amplified-2026', 1, 'published', 'Turn it up to 11. Heavy music festival returns.', 'Montreal', 'https://ticketscene.ca/april-amp-2026'),
(32, 'Tulip Tunes 2026', '2026-05-16', 'tulip-tunes-2026', 1, 'published', 'Blooming music festival. Outdoor stages and garden parties.', 'Ottawa', 'https://ticketscene.ca/tulip-2026'),
(33, 'Summer Solstice 2026', '2026-06-20', 'summer-solstice-2026', 1, 'published', 'Longest day of the year, longest music festival. 15 hours of performances.', 'Toronto', 'https://ticketscene.ca/solstice-2026'),
(34, 'Canada Day Festival 2026', '2026-07-01', 'canada-day-2026', 1, 'published', 'Celebrating 159 years of Canada with coast-to-coast music.', 'Ottawa', 'https://ticketscene.ca/canada-day-2026'),
(35, 'August Heat Wave 2026', '2026-08-08', 'august-heat-2026', 1, 'published', 'Summer''s hottest weekend. Dance floors and outdoor stages.', 'Montreal', 'https://ticketscene.ca/august-heat-2026'),
(36, 'Labour Day Loud 2026', '2026-09-07', 'labour-day-2026', 1, 'published', 'Working class music festival. Punk, hardcore, and union solidarity.', 'Hamilton', 'https://ticketscene.ca/labour-loud-2026'),
(37, 'Autumn Acoustics 2026', '2026-10-10', 'autumn-acoustics-2026', 1, 'published', 'Thanksgiving weekend acoustic showcase. Intimate venues, grateful vibes.', 'Kingston', 'https://ticketscene.ca/autumn-2026'),
(38, 'Halloween Havoc 2026', '2026-10-31', 'halloween-havoc-2026', 1, 'published', 'All Hallows Eve spectacular. Goth, industrial, and dark electronica.', 'Toronto', 'https://ticketscene.ca/halloween-2026'),
(39, 'November Noise 2026', '2026-11-14', 'november-noise-2026', 1, 'published', 'Experimental music weekend. Push boundaries, break rules.', 'Montreal', 'https://ticketscene.ca/noise-2026'),
(40, 'Holiday Hootenanny 2026', '2026-12-12', 'holiday-hootenanny-2026', 1, 'published', 'Fourth annual holiday party. Community celebration and music.', 'Ottawa', 'https://ticketscene.ca/holiday-2026');

-- ============================================
-- 2026 BANDS (150+ new bands)
-- ============================================

-- Winter Warm-Up 2026 (Event 28)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(151, 28, 1, 'The Icicles', '19:00', '19:45', 'Indie Rock', 'Ottawa', 'Crystalline indie rock'),
(152, 28, 1, 'Deep Freeze', '20:00', '20:45', 'Post-Rock', 'Iceland', 'Icelandic post-rock legends'),
(153, 28, 1, 'Subzero', '21:00', '22:00', 'Metal', 'Norway', 'Black metal from the north'),
(154, 28, 2, 'Hot Toddies', '20:00', '20:45', 'Folk Rock', 'Ottawa', 'Warming folk rock'),
(155, 28, 2, 'The Furnace', '21:00', '21:45', 'Blues Rock', 'Chicago', 'Scorching blues rock'),
(156, 28, 3, 'Thermal Mass', '21:30', '22:15', 'Industrial', 'Detroit', 'Heavy industrial heat'),
(157, 28, 4, 'Windchill Factor', '22:00', '23:00', 'Electronic', 'Toronto', 'Chilling electronic beats'),
(158, 28, 5, 'The Radiators', '20:00', '20:45', 'Punk', 'Montreal', 'Hot punk energy');

-- Frost Fest 2026 (Event 29)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(159, 29, 1, 'Valentine Rough', '19:00', '19:45', 'Post-Punk', 'Ottawa', 'Anti-romantic post-punk'),
(160, 29, 1, 'Sweethearts', '20:00', '20:45', 'Pop Punk', 'Toronto', 'Candy-sweet pop punk'),
(161, 29, 1, 'Heartbreak Hotel', '21:00', '22:00', 'Emo', 'Las Vegas', 'Emotional rock ballads'),
(162, 29, 2, 'The Crushes', '20:00', '20:45', 'Indie Pop', 'Montreal', 'Charming indie pop'),
(163, 29, 2, 'Cupid''s Arrow', '21:00', '21:45', 'Synth Pop', 'Ottawa', 'Aimed synth pop'),
(164, 29, 3, 'Broken Hearts Club', '21:30', '22:15', 'Emo Pop', 'Toronto', 'Sad boi anthems'),
(165, 29, 4, 'Love Languages', '22:00', '23:00', 'R&B', 'Atlanta', 'Smooth R&B grooves'),
(166, 29, 5, 'The Romantics', '20:00', '20:45', 'Power Pop', 'Detroit', 'Classic power pop');

-- Spring Thaw 2026 (Event 30)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(167, 30, 6, 'New Growth', '19:00', '19:45', 'Folk', 'Toronto', 'Fresh folk sounds'),
(168, 30, 6, 'The Crocuses', '20:00', '20:45', 'Indie Pop', 'Montreal', 'Early blooming indie'),
(169, 30, 6, 'Vernal Equinox', '21:00', '22:00', 'Progressive Rock', 'Vancouver', 'Balanced prog rock'),
(170, 30, 7, 'Rain Dance', '20:00', '20:45', 'World Music', 'Brazil', 'Brazilian rain rhythms'),
(171, 30, 7, 'The Seedlings', '21:00', '21:45', 'Singer-Songwriter', 'Ottawa', 'Growing songwriter talent'),
(172, 30, 8, 'Thaw', '21:30', '22:15', 'Ambient', 'Toronto', 'Melting ambient soundscapes'),
(173, 30, 9, 'The Greenery', '22:00', '23:00', 'Psych Rock', 'Portland', 'Lush psychedelic rock'),
(174, 30, 10, 'Rebirth', '20:00', '20:45', 'Electronic', 'Montreal', 'Regenerative electronic');

-- April Amplified 2026 (Event 31)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(175, 31, 11, 'The Loudspeakers', '19:00', '19:45', 'Punk', 'Montreal', 'Maximum volume punk'),
(176, 31, 11, 'Sonic Boom', '20:00', '20:45', 'Noise Rock', 'New York', 'NYC noise legends'),
(177, 31, 11, 'Ear Damage', '21:00', '22:00', 'Grindcore', 'Birmingham', 'UK grindcore assault'),
(178, 31, 12, 'The Megaphones', '20:00', '20:45', 'Hardcore', 'Boston', 'Boston hardcore'),
(179, 31, 12, 'Volume Knob', '21:00', '21:45', 'Stoner Rock', 'Desert', 'Maximum fuzz rock'),
(180, 31, 13, 'Tinnitus', '20:00', '20:45', 'Doom Metal', 'Montreal', 'Ringing doom metal'),
(181, 31, 13, 'The PA System', '21:00', '21:45', 'Industrial', 'Berlin', 'Amplified industrial'),
(182, 31, 13, 'Feedback Frenzy', '22:00', '23:00', 'Noise', 'Tokyo', 'Japanese noise chaos'),
(183, 31, 14, 'Blown Speaker', '22:00', '23:30', 'Electronic', 'Detroit', 'Distorted techno');

-- Tulip Tunes 2026 (Event 32)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(184, 32, 1, 'The Gardeners', '14:00', '14:45', 'Folk', 'Ottawa', 'Cultivated folk music'),
(185, 32, 1, 'Bloom', '15:00', '15:45', 'Dream Pop', 'Toronto', 'Flowering dream pop'),
(186, 32, 1, 'The Botanists', '16:00', '16:45', 'Indie Rock', 'Montreal', 'Scientific indie rock'),
(187, 32, 1, 'Petal Power', '17:00', '17:45', 'Psychedelic', 'San Francisco', 'Flower power psych'),
(188, 32, 1, 'Dutch Courage', '18:00', '19:00', 'Rock', 'Netherlands', 'Dutch rock visitors'),
(189, 32, 2, 'The Stems', '19:00', '19:45', 'Garage Rock', 'Perth', 'Australian garage'),
(190, 32, 2, 'Root System', '20:00', '20:45', 'Dub', 'Kingston JM', 'Deep roots reggae'),
(191, 32, 2, 'Bulb Fiction', '21:00', '21:45', 'Alternative', 'Ottawa', 'Planted alternative rock'),
(192, 32, 3, 'The Florists', '20:00', '20:45', 'Pop', 'Toronto', 'Arranged pop music'),
(193, 32, 3, 'Garden State', '21:00', '21:45', 'Indie Folk', 'New Jersey', 'Jersey folk rock');

-- Summer Solstice 2026 (Event 33)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(194, 33, 6, 'Dawn Patrol', '06:00', '06:45', 'Acoustic', 'Toronto', 'Sunrise acoustic set'),
(195, 33, 6, 'Morning Glory', '07:00', '07:45', 'Folk', 'Halifax', 'Morning folk songs'),
(196, 33, 6, 'The Early Birds', '08:00', '08:45', 'Jazz', 'Montreal', 'Early morning jazz'),
(197, 33, 6, 'Noon Day Sun', '12:00', '12:45', 'Rock', 'Calgary', 'High noon rock'),
(198, 33, 6, 'Afternoon Delight', '15:00', '15:45', 'Soft Rock', 'Vancouver', 'Mellow afternoon vibes'),
(199, 33, 6, 'Golden Hour', '18:00', '18:45', 'Indie Pop', 'Ottawa', 'Magic hour music'),
(200, 33, 6, 'Sunset Strip', '19:00', '19:45', 'Rock', 'Los Angeles', 'LA sunset rock'),
(201, 33, 7, 'Twilight Zone', '20:00', '20:45', 'Post-Punk', 'Manchester', 'UK post-punk'),
(202, 33, 7, 'Dusk Till Dawn', '21:00', '21:45', 'Electronic', 'London', 'All-night electronic'),
(203, 33, 7, 'Night Owls', '22:00', '22:45', 'Indie Rock', 'Brooklyn', 'Late night indie'),
(204, 33, 8, 'The Insomniacs', '23:00', '23:45', 'Noise Pop', 'Seattle', 'Sleepless noise pop'),
(205, 33, 8, 'Midnight Oil', '00:00', '01:00', 'Rock', 'Sydney', 'Australian rock legends');

-- Canada Day 2026 (Event 34)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(206, 34, 1, 'Coast to Coast', '12:00', '12:45', 'Folk Rock', 'St. John''s', 'Atlantic folk rock'),
(207, 34, 1, 'The Maritimers', '13:00', '13:45', 'Celtic', 'Halifax', 'Celtic traditions'),
(208, 34, 1, 'Great White North', '14:00', '14:45', 'Rock', 'Toronto', 'Canadian rock anthems'),
(209, 34, 1, 'The Prairies', '15:00', '15:45', 'Country', 'Regina', 'Prairie country'),
(210, 34, 1, 'Rocky Mountain High', '16:00', '16:45', 'Folk', 'Banff', 'Mountain folk'),
(211, 34, 1, 'Pacific Sound', '17:00', '18:00', 'Indie Rock', 'Victoria', 'West coast indie'),
(212, 34, 2, 'The Northerners', '19:00', '19:45', 'Folk', 'Whitehorse', 'Northern stories'),
(213, 34, 2, 'Aurora', '20:00', '20:45', 'Electronic', 'Yellowknife', 'Northern lights electronic'),
(214, 34, 2, 'The Quebecois', '21:00', '22:00', 'Rock', 'Quebec City', 'Quebec rock en français'),
(215, 34, 3, 'Acadia', '20:00', '20:45', 'Folk', 'Moncton', 'Acadian folk traditions'),
(216, 34, 3, 'Métis Nation', '21:00', '21:45', 'Folk Rock', 'Winnipeg', 'Métis heritage music'),
(217, 34, 4, 'The Shield', '22:00', '23:00', 'Post-Rock', 'Sudbury', 'Canadian Shield soundscapes');

-- August Heat Wave 2026 (Event 35)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(218, 35, 11, 'Summer Sweat', '19:00', '19:45', 'Funk', 'Montreal', 'Sweaty funk grooves'),
(219, 35, 11, 'The Scorchers', '20:00', '20:45', 'Rock', 'Phoenix', 'Desert rock heat'),
(220, 35, 11, 'Humidity', '21:00', '22:00', 'Soul', 'New Orleans', 'Sticky soul music'),
(221, 35, 12, 'Heat Stroke', '20:00', '20:45', 'Punk', 'Miami', 'Florida punk heat'),
(222, 35, 12, 'The Thermals', '21:00', '21:45', 'Indie Rock', 'Portland', 'Pacific NW indie'),
(223, 35, 13, 'Dog Days', '20:00', '20:45', 'Alternative', 'Montreal', 'Late summer alternative'),
(224, 35, 13, 'Meltdown', '21:00', '21:45', 'Metal', 'Texas', 'Melting metal'),
(225, 35, 13, 'The Sun Gods', '22:00', '23:00', 'Psych Rock', 'California', 'Sun-worshipping psych'),
(226, 35, 14, 'Tropical Storm', '22:00', '23:30', 'Dance', 'Caribbean', 'Island dance party');

-- Labour Day 2026 (Event 36)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(227, 36, 17, 'The Proletariat', '14:00', '14:45', 'Punk', 'Hamilton', 'Working class punk'),
(228, 36, 17, 'Solidarity', '15:00', '15:45', 'Hardcore', 'Detroit', 'Union hardcore'),
(229, 36, 17, 'Blue Collar', '16:00', '16:45', 'Rock', 'Pittsburgh', 'Working man''s rock'),
(230, 36, 17, 'The Labourers', '17:00', '17:45', 'Folk Punk', 'Winnipeg', 'Labour folk punk'),
(231, 36, 17, 'General Strike', '18:00', '19:00', 'Hardcore', 'Seattle', 'Revolutionary hardcore'),
(232, 36, 17, 'Factory Floor', '19:00', '19:45', 'Industrial', 'Manchester', 'Factory industrial'),
(233, 36, 17, 'The Organizers', '20:00', '20:45', 'Punk', 'Chicago', 'Union organizing punk'),
(234, 36, 17, 'Shift Change', '21:00', '22:00', 'Metal', 'Hamilton', 'Heavy labour metal');

-- Autumn Acoustics 2026 (Event 37)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(235, 37, 18, 'The Thankful', '19:00', '19:45', 'Folk', 'Kingston', 'Grateful folk songs'),
(236, 37, 18, 'Harvest Moon', '20:00', '20:45', 'Country', 'Nashville', 'Harvest country'),
(237, 37, 18, 'Cornucopia', '21:00', '22:00', 'Americana', 'Austin', 'Abundant americana'),
(238, 37, 18, 'The Gatherings', '20:00', '20:45', 'Folk Rock', 'Toronto', 'Family gathering music'),
(239, 37, 18, 'Gratitude', '21:00', '21:45', 'Singer-Songwriter', 'Montreal', 'Thankful songs'),
(240, 37, 18, 'Autumn Leaves', '22:00', '23:00', 'Jazz', 'Paris', 'French autumn jazz');

-- Halloween Havoc 2026 (Event 38)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(241, 38, 6, 'The Cryptkeepers', '20:00', '20:45', 'Horror Punk', 'Toronto', 'Tales from the crypt'),
(242, 38, 6, 'Bela Lugosi''s Dead', '21:00', '21:45', 'Goth Rock', 'London', 'Gothic rock legends'),
(243, 38, 6, 'The Werewolves', '22:00', '22:45', 'Garage Rock', 'Detroit', 'Howling garage rock'),
(244, 38, 6, 'Full Moon Fever', '23:00', '00:00', 'Psychobilly', 'Memphis', 'Lycanthropic psychobilly'),
(245, 38, 7, 'The Zombies', '20:00', '20:45', 'Rock', 'St. Albans', 'British invasion legends'),
(246, 38, 7, 'Frankenstein', '21:00', '21:45', 'Metal', 'Germany', 'Monster metal'),
(247, 38, 7, 'Dracula''s Castle', '22:00', '23:00', 'Dark Wave', 'Romania', 'Transylvanian dark wave'),
(248, 38, 8, 'The Poltergeists', '22:00', '22:45', 'Post-Punk', 'Manchester', 'Haunting post-punk'),
(249, 38, 8, 'Black Magic', '23:00', '00:00', 'Industrial', 'Berlin', 'Occult industrial'),
(250, 38, 9, 'The Exorcists', '00:00', '01:00', 'Doom Metal', 'New Orleans', 'Demonic doom');

-- November Noise 2026 (Event 39)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(251, 39, 11, 'Sonic Assault', '19:00', '19:45', 'Noise', 'Montreal', 'Aggressive noise'),
(252, 39, 11, 'The Amplifiers', '20:00', '20:45', 'Noise Rock', 'Providence', 'Rhode Island noise'),
(253, 39, 11, 'Frequency Response', '21:00', '22:00', 'Experimental', 'Cologne', 'German experimental'),
(254, 39, 12, 'Signal Chain', '20:00', '20:45', 'Drone', 'Montreal', 'Endless drone'),
(255, 39, 12, 'The Modulators', '21:00', '21:45', 'Modular', 'Amsterdam', 'Dutch modular synth'),
(256, 39, 13, 'Harsh Reality', '20:00', '20:45', 'Harsh Noise', 'Osaka', 'Japanese harsh noise'),
(257, 39, 13, 'The Deconstructors', '21:00', '21:45', 'Noise', 'Chicago', 'Chicago deconstruction'),
(258, 39, 13, 'Abstract Sound', '22:00', '23:00', 'Abstract', 'Vienna', 'Viennese abstraction');

-- Holiday Hootenanny 2026 (Event 40)
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(259, 40, 1, 'Jingle All The Way', '19:00', '19:45', 'Pop Punk', 'Ottawa', 'Holiday pop punk'),
(260, 40, 1, 'The Snow Angels', '20:00', '20:45', 'Indie Pop', 'Toronto', 'Heavenly indie pop'),
(261, 40, 1, 'Mistletoe', '21:00', '22:00', 'Folk Rock', 'Montreal', 'Kissing folk rock'),
(262, 40, 2, 'The Reindeer', '20:00', '20:45', 'Alternative', 'Alaska', 'Arctic alternative'),
(263, 40, 2, 'Candy Cane Lane', '21:00', '21:45', 'Indie Rock', 'Ottawa', 'Sweet indie rock'),
(264, 40, 3, 'Scrooge', '21:30', '22:15', 'Punk', 'London', 'Bah humbug punk'),
(265, 40, 4, 'The Yule Log', '22:00', '23:00', 'Ambient', 'Norway', 'Burning ambient'),
(266, 40, 5, 'New Year''s Eve', '20:00', '20:45', 'Dance', 'Times Square', 'Countdown dance');

-- Add some bands to fill out events with more performers
-- Spring Thaw 2026 extras
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(267, 30, 6, 'Sap Rising', '22:30', '23:15', 'Indie Rock', 'Vermont', 'Maple country indie'),
(268, 30, 7, 'Ice Out', '22:30', '23:15', 'Rock', 'Minnesota', 'Lake thaw rock');

-- Canada Day 2026 extras
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(269, 34, 1, 'The Confederation', '18:30', '19:30', 'Progressive Rock', 'Ottawa', 'Historical prog rock'),
(270, 34, 2, 'Nunavut', '22:30', '23:30', 'Throat Singing', 'Iqaluit', 'Inuit throat singing');

-- Summer Solstice 2026 extras
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(271, 33, 9, 'Twenty-Four Seven', '01:30', '02:30', 'Electronic', 'Berlin', 'All night electronic'),
(272, 33, 9, 'The Marathon', '03:00', '04:00', 'Ambient', 'Iceland', 'Endurance ambient');

-- Halloween 2026 extras
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(273, 38, 7, 'Trick or Treat', '23:30', '00:30', 'Punk', 'Toronto', 'Candy punk'),
(274, 38, 9, 'The Haunting', '01:30', '02:30', 'Ambient', 'Salem', 'Ghostly ambient');

-- August Heat Wave 2026 extras
INSERT OR REPLACE INTO bands (id, event_id, venue_id, name, start_time, end_time, genre, origin, description) VALUES
(275, 35, 11, 'Siesta', '22:30', '23:30', 'Latin', 'Barcelona', 'Spanish heat'),
(276, 35, 12, 'The Sunburns', '22:30', '23:15', 'Surf Rock', 'San Diego', 'Burnt surf rock');

-- Update sqlite_sequence
DELETE FROM sqlite_sequence WHERE name IN ('events', 'bands');
INSERT INTO sqlite_sequence (name, seq) VALUES ('events', 40), ('bands', 276);
