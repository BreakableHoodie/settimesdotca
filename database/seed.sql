-- Long Weekend Band Crawl - Sample Data
--
-- This file contains sample data for testing the admin panel and API.
-- Includes one event with venues and bands from the current bands.json

-- Insert sample event
INSERT INTO events (name, date, slug, is_published) VALUES
  ('Long Weekend Band Crawl - October 2025', '2025-10-12', 'october-2025', 1);

-- Insert venues (based on current bands.json)
INSERT INTO venues (name, address) VALUES
  ('Room 47', '47 Front St E, Toronto, ON'),
  ('Prohibition Warehouse', '99 Sudbury St, Toronto, ON'),
  ('AristoCanine', '123 Example St, Toronto, ON'),
  ('Princess Cafe', '456 Princess St, Toronto, ON');

-- Insert sample bands for the event
-- Using event_id = 1 (first event) and corresponding venue_ids

-- Room 47 bands
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 1, 'Real Sickies', '20:00', '20:30', NULL),
  (1, 1, 'The Flatliners', '21:00', '21:45', NULL),
  (1, 1, 'Dilly Dally', '22:15', '23:00', NULL);

-- Prohibition Warehouse bands
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 2, 'PUP', '20:30', '21:15', NULL),
  (1, 2, 'Single Mothers', '21:45', '22:30', NULL),
  (1, 2, 'Pkew Pkew Pkew', '23:00', '23:45', NULL);

-- AristoCanine bands
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 3, 'Metz', '19:30', '20:15', NULL),
  (1, 3, 'Weaves', '20:45', '21:30', NULL),
  (1, 3, 'Odonis Odonis', '22:00', '22:45', NULL);

-- Princess Cafe bands
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 4, 'Greys', '19:00', '19:45', NULL),
  (1, 4, 'Teenanger', '20:15', '21:00', NULL),
  (1, 4, 'Fake Palms', '21:30', '22:15', NULL);
