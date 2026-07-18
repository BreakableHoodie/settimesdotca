-- Migration: 0053_add_event_poster_url
-- Adds poster_url for the event's promotional poster image (#616), uploaded
-- via the admin UI through the shared R2 photo pipeline (event-posters/
-- prefix). NULL means "no poster" — surfaces (MusicEvent JSON-LD image,
-- og:image/twitter:image, recap page) all no-op when this is absent.
-- Edition-specific like doors_json (#569): event duplication deliberately
-- does not copy it.

ALTER TABLE events ADD COLUMN poster_url TEXT;
