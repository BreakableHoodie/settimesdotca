-- Production Data Sync
-- This script replaces test data with real LWBC Vol. 15 data
-- Run with: npx wrangler d1 execute settimes-production-db --file=database/production-data-sync.sql --remote

-- Clear existing test data (in correct order due to foreign keys)
DELETE FROM performances;
DELETE FROM band_profiles;
DELETE FROM venues WHERE id NOT IN (SELECT DISTINCT venue_id FROM performances);
DELETE FROM events;

-- Insert real event
INSERT INTO events VALUES(1,'Long Weekend Band Crawl - Vol. 15','2026-02-15','lwbc15',1,'2026-01-08 23:32:31',NULL,4,'2026-01-29 19:19:47','published',NULL,'https://ticketscene.ca/events/57661/',NULL,NULL,'{"instagram":"longweekendbandcrawl","facebook":"https://www.facebook.com/share/1AF7hMe7ho/"}',NULL,'Waterloo, ON');

-- Insert real venues
INSERT INTO venues VALUES(4,'Room 47','47 King St N, Waterloo, ON N2J 2W9',NULL,NULL,'2026-01-26 19:02:22','https://room47.ca','room47to',NULL,'2026-01-08 23:32:31');
INSERT INTO venues VALUES(6,'Prohibition Warehouse','56 King St N, Waterloo, ON N2J 2X1',NULL,NULL,'2026-01-26 19:02:55',NULL,NULL,NULL,'2026-01-26 19:02:55');
INSERT INTO venues VALUES(7,'Revive Karaoke','28 King St N, Waterloo, ON N2J 2W7',NULL,NULL,'2026-01-26 19:04:17',NULL,NULL,NULL,'2026-01-26 19:04:17');
INSERT INTO venues VALUES(8,'Princess Cafe','46 King St N, Waterloo, ON N2J 2W8',NULL,NULL,'2026-01-26 19:04:47',NULL,NULL,NULL,'2026-01-26 19:04:47');

-- Insert real band profiles
INSERT INTO band_profiles VALUES(16,'Witchrot','witchrot','','','metal','{"website":"","instagram":"witchrot666","bandcamp":"https://witchrot.bandcamp.com/","facebook":"https://www.facebook.com/witchrot/"}','2026-01-26 18:59:58','2026-01-26 20:28:33',NULL,'Toronto, ON');
INSERT INTO band_profiles VALUES(17,'Space Pope','spacepope',NULL,NULL,NULL,'{"website":"","instagram":"spacepopedoom","bandcamp":"https://spacepopedoom.bandcamp.com","facebook":"https://www.facebook.com/SpacePopeDoom"}','2026-01-26 21:31:43','2026-01-26 21:31:43',NULL,'Kitchener, ON');
INSERT INTO band_profiles VALUES(18,'Kelly Spears','kellyspears',NULL,NULL,NULL,'{"website":"","instagram":"leavekellyspearsalone","bandcamp":"","facebook":""}','2026-01-26 21:33:16','2026-01-26 21:33:16',NULL,'Kitchener, ON');
INSERT INTO band_profiles VALUES(19,'Birdhand','birdhand',NULL,NULL,'punk','{"website":"","instagram":"birdhandband","bandcamp":"https://birdhandtheband.bandcamp.com","facebook":"https://www.facebook.com/profile.php?id=61584060066080"}','2026-01-26 21:36:58','2026-01-26 21:36:58',NULL,'Guelph, ON');
INSERT INTO band_profiles VALUES(20,'SKAtharines','skatharines',NULL,NULL,NULL,'{"website":"","instagram":"ska.tharines","bandcamp":"https://skatharines.bandcamp.com","facebook":"https://www.facebook.com/skatharines"}','2026-01-26 21:41:41','2026-01-26 21:41:41',NULL,NULL);
INSERT INTO band_profiles VALUES(21,'Early Heaven','earlyheaven',NULL,NULL,NULL,'{"website":"","instagram":"earlyheavenxoxo","bandcamp":"https://earlyheaven.bandcamp.com","facebook":""}','2026-01-26 21:47:40','2026-01-26 21:47:40',NULL,'Toronto, ON');
INSERT INTO band_profiles VALUES(22,'$wamp A$$','wampa',NULL,NULL,NULL,'{"website":"","instagram":"","bandcamp":"","facebook":""}','2026-01-26 21:55:42','2026-01-26 21:55:42',NULL,NULL);
INSERT INTO band_profiles VALUES(23,'Francium','francium',NULL,NULL,NULL,'{"website":"","instagram":"franciumbandofficial","bandcamp":"https://franciumband.bandcamp.com","facebook":"https://www.facebook.com/FranciumBand/"}','2026-01-26 22:04:20','2026-01-26 22:04:20',NULL,'Waterloo, ON');
INSERT INTO band_profiles VALUES(24,'Fuzz Vultures','fuzzvultures',NULL,NULL,NULL,'{"website":"","instagram":"vulturesoffuzz","bandcamp":"","facebook":"https://www.facebook.com/profile.php?id=61584697317250"}','2026-01-26 22:06:51','2026-01-26 22:06:51',NULL,'Toronto, ON');
INSERT INTO band_profiles VALUES(25,'Church Fight','churchfight',NULL,NULL,NULL,'{"website":"https://www.churchfight.com","instagram":"churchfight","bandcamp":"https://churchfight.bandcamp.com","facebook":"https://www.facebook.com/ragripperband"}','2026-01-26 22:09:23','2026-01-26 22:09:23',NULL,'Cambridge, ON');
INSERT INTO band_profiles VALUES(26,'AAWKS','aawks',NULL,NULL,NULL,'{"website":"","instagram":"aawksband","bandcamp":"https://aawks.bandcamp.com","facebook":"https://www.facebook.com/AAWKSBAND"}','2026-01-26 22:12:14','2026-01-26 22:12:14',NULL,'Barrie, ON');
INSERT INTO band_profiles VALUES(27,'Shrieking','shrieking',NULL,NULL,NULL,'{"website":"","instagram":"shriek1ng","bandcamp":"https://shrieking.bandcamp.com","facebook":""}','2026-01-26 22:20:06','2026-01-26 22:20:06',NULL,'Kitchener, ON');
INSERT INTO band_profiles VALUES(28,'Your Pal Bill','yourpalbill',NULL,NULL,NULL,'{"website":"","instagram":"yourpalbill","bandcamp":"https://yourpalbill.bandcamp.com/","facebook":""}','2026-01-26 22:22:21','2026-01-26 22:22:21',NULL,'Milton, ON');
INSERT INTO band_profiles VALUES(29,'Melody Bijou','melodybijou',NULL,NULL,NULL,'{"website":"","instagram":"melody.bijou","bandcamp":"","facebook":""}','2026-01-26 22:28:55','2026-01-26 22:28:55',NULL,'Kitchener, ON');

-- Insert real performances
INSERT INTO performances VALUES(16,1,16,4,'20:50','21:30',NULL,'2026-01-26 20:19:19',NULL,NULL,'2026-01-26 20:19:19');
INSERT INTO performances VALUES(17,1,17,4,'19:35','20:10',NULL,'2026-01-26 21:31:43',NULL,NULL,'2026-01-26 21:31:43');
INSERT INTO performances VALUES(18,1,18,6,'18:45','19:15',NULL,'2026-01-26 21:34:01',NULL,NULL,'2026-01-26 21:34:01');
INSERT INTO performances VALUES(19,1,19,6,'20:15','20:45',NULL,'2026-01-26 21:36:58',NULL,NULL,'2026-01-26 21:36:58');
INSERT INTO performances VALUES(20,1,20,6,'21:35','22:05',NULL,'2026-01-26 21:41:41',NULL,NULL,'2026-01-26 21:41:41');
INSERT INTO performances VALUES(21,1,21,6,'22:45','23:15',NULL,'2026-01-26 21:47:40',NULL,NULL,'2026-01-26 21:47:40');
INSERT INTO performances VALUES(22,1,22,6,'23:55','00:25',NULL,'2026-01-26 21:55:42',NULL,NULL,'2026-01-26 21:55:42');
INSERT INTO performances VALUES(23,1,23,7,'19:00','19:30',NULL,'2026-01-26 22:04:57',NULL,NULL,'2026-01-26 22:04:57');
INSERT INTO performances VALUES(24,1,24,7,'20:15','20:45',NULL,'2026-01-26 22:06:51',NULL,NULL,'2026-01-26 22:06:51');
INSERT INTO performances VALUES(25,1,25,7,'22:10','22:40',NULL,'2026-01-26 22:09:23',NULL,NULL,'2026-01-26 22:09:23');
INSERT INTO performances VALUES(26,1,26,7,'23:20','23:50',NULL,'2026-01-26 22:12:14',NULL,NULL,'2026-01-26 22:12:14');
INSERT INTO performances VALUES(27,1,27,8,'18:55','19:25',NULL,'2026-01-26 22:20:06',NULL,NULL,'2026-01-26 22:20:06');
INSERT INTO performances VALUES(28,1,28,8,'20:15','20:45',NULL,'2026-01-26 22:22:21',NULL,NULL,'2026-01-26 22:22:21');
INSERT INTO performances VALUES(29,1,29,8,'21:50','22:20',NULL,'2026-01-26 22:28:55',NULL,NULL,'2026-01-26 22:28:55');
