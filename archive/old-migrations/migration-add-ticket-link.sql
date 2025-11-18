-- Migration: Add ticket_link to events table
-- This allows events to have a link to tickets for sale

ALTER TABLE events ADD COLUMN ticket_link TEXT;

-- Add comment to document the field
-- ticket_link: URL where people can buy tickets for this event

