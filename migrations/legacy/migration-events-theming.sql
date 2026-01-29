-- Migration: Add ticket URLs, theme colors, and global theme settings
-- Pink Lemonade Records - Event and Theming Enhancements

-- Add new fields to events table
ALTER TABLE events ADD COLUMN ticket_url TEXT;
ALTER TABLE events ADD COLUMN theme_colors TEXT; -- JSON: {primary, secondary, accent}
ALTER TABLE events ADD COLUMN venue_info TEXT;   -- JSON: [{name, address, googleMaps, note}]
ALTER TABLE events ADD COLUMN social_links TEXT; -- JSON: {instagram, facebook, ticketLink}

-- Create theme_settings table for global color scheme
CREATE TABLE IF NOT EXISTS theme_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row allowed
  primary_color TEXT NOT NULL DEFAULT '#FF6B35',      -- band-orange
  secondary_color TEXT NOT NULL DEFAULT '#1a1a2e',    -- band-navy
  accent_color TEXT NOT NULL DEFAULT '#16213e',       -- band-purple
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default theme (Pink Lemonade Records colors)
INSERT OR IGNORE INTO theme_settings (id, primary_color, secondary_color, accent_color, text_color)
VALUES (1, '#FF6B35', '#1a1a2e', '#16213e', '#ffffff');

-- Update events table to remove org_id constraint (already done in single-org migration)
-- Note: SQLite doesn't support DROP COLUMN, so we document that org_id is deprecated
-- New events should not use org_id field
