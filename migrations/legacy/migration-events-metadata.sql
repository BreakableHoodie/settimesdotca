-- Migration: Add description and city fields to events

ALTER TABLE events ADD COLUMN description TEXT;
ALTER TABLE events ADD COLUMN city TEXT;
