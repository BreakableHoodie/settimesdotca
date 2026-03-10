-- Migration: 0026_normalize_empty_url_fields.sql
-- Purpose: Normalize legacy empty-string URL fields to NULL after URL sanitization cleanup.

UPDATE events
SET ticket_url = NULL
WHERE ticket_url IS NOT NULL
  AND trim(ticket_url) = '';

UPDATE band_profiles
SET photo_url = NULL
WHERE photo_url IS NOT NULL
  AND trim(photo_url) = '';