-- Ensure venues table has city column for public endpoints
ALTER TABLE venues ADD COLUMN city TEXT;
