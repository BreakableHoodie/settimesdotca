-- Migration: Import Waterloo Long Weekend Band Crawl - October 2025
-- Generated manually from bands.json
-- Event: Waterloo Long Weekend Band Crawl - October 2025

-- First, ensure schema exists
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  address TEXT
);

CREATE TABLE IF NOT EXISTS bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  venue_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert event
INSERT INTO events (name, date, slug, is_published) VALUES 
  ('Waterloo Long Weekend Band Crawl - October 2025', '2025-10-12', 'waterloo-oct-2025', 1);

-- Insert venues
INSERT INTO venues (name) VALUES
  ('Room 47'),
  ('Prohibition Warehouse'),
  ('AristoCanine'),
  ('Princess Cafe');

-- Insert bands from Room 47
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 1, 'Real Sickies', '20:00', '20:30', NULL),
  (1, 1, 'Doghouse Rose', '21:00', '21:30', NULL),
  (1, 1, 'BA Johnston', '22:30', '23:10', NULL),
  (1, 1, 'Ripcordz', '00:10', '00:50', NULL);

-- Insert bands from Prohibition Warehouse
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 2, 'Mr Hands', '18:45', '19:15', NULL),
  (1, 2, 'Uppercut', '19:30', '20:00', NULL),
  (1, 2, 'Heartland Province', '20:30', '21:00', NULL),
  (1, 2, 'Chris Murray', '22:00', '22:30', NULL),
  (1, 2, 'Handheld', '23:10', '23:40', NULL);

-- Insert bands from AristoCanine
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 3, 'Petrochemicals', '19:15', '19:45', NULL),
  (1, 3, 'Harm School', '20:30', '21:00', NULL),
  (1, 3, 'Lee Reed', '21:30', '22:00', NULL),
  (1, 3, 'Blackout!', '23:40', '23:59', NULL),
  (1, 3, 'Afterparty with DJ Chives', '01:00', '02:00', NULL);

-- Insert bands from Princess Cafe
INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES
  (1, 4, 'Kate & Friends', '18:45', '19:15', NULL),
  (1, 4, 'Making Woman', '19:30', '20:00', NULL),
  (1, 4, 'EJ Fleming', '20:30', '21:00', NULL),
  (1, 4, 'Ben Stager', '21:45', '22:15', NULL);
