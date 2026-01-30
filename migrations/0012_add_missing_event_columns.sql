-- Add missing columns to events table for Public API compatibility
ALTER TABLE events ADD COLUMN city TEXT;
ALTER TABLE events ADD COLUMN description TEXT;
