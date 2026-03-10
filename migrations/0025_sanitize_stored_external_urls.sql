-- Migration: 0025_sanitize_stored_external_urls.sql
-- Purpose: Remove previously stored non-http(s) URL values from event and band profile records.
-- Note: Trusted-device token hashing is handled lazily in application code on first successful use.

-- Normalize standalone event ticket URLs.
UPDATE events
SET ticket_url = NULL
WHERE ticket_url IS NOT NULL
  AND trim(ticket_url) != ''
  AND lower(trim(ticket_url)) NOT LIKE 'http://%'
  AND lower(trim(ticket_url)) NOT LIKE 'https://%';

-- Drop malformed event JSON payloads so the frontend no longer consumes unsafe legacy data.
UPDATE events
SET social_links = NULL
WHERE social_links IS NOT NULL
  AND NOT json_valid(social_links);

UPDATE events
SET venue_info = NULL
WHERE venue_info IS NOT NULL
  AND NOT json_valid(venue_info);

-- Rebuild event social link objects using only the supported keys and safe URL fields.
UPDATE events
SET social_links = (
  WITH extracted AS (
    SELECT
      CASE
        WHEN lower(trim(COALESCE(json_extract(events.social_links, '$.website'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(events.social_links, '$.website'), ''))) LIKE 'https://%'
          THEN trim(json_extract(events.social_links, '$.website'))
        ELSE NULL
      END AS website,
      CASE
        WHEN trim(COALESCE(json_extract(events.social_links, '$.instagram'), '')) = '' THEN NULL
        ELSE trim(json_extract(events.social_links, '$.instagram'))
      END AS instagram,
      CASE
        WHEN lower(trim(COALESCE(json_extract(events.social_links, '$.facebook'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(events.social_links, '$.facebook'), ''))) LIKE 'https://%'
          THEN trim(json_extract(events.social_links, '$.facebook'))
        ELSE NULL
      END AS facebook,
      CASE
        WHEN trim(COALESCE(json_extract(events.social_links, '$.x'), '')) = '' THEN NULL
        ELSE trim(json_extract(events.social_links, '$.x'))
      END AS x,
      CASE
        WHEN trim(COALESCE(json_extract(events.social_links, '$.tiktok'), '')) = '' THEN NULL
        ELSE trim(json_extract(events.social_links, '$.tiktok'))
      END AS tiktok,
      CASE
        WHEN lower(trim(COALESCE(json_extract(events.social_links, '$.youtube'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(events.social_links, '$.youtube'), ''))) LIKE 'https://%'
          THEN trim(json_extract(events.social_links, '$.youtube'))
        ELSE NULL
      END AS youtube,
      CASE
        WHEN lower(trim(COALESCE(json_extract(events.social_links, '$.bandcamp'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(events.social_links, '$.bandcamp'), ''))) LIKE 'https://%'
          THEN trim(json_extract(events.social_links, '$.bandcamp'))
        ELSE NULL
      END AS bandcamp
  )
  SELECT CASE
    WHEN website IS NULL
      AND instagram IS NULL
      AND facebook IS NULL
      AND x IS NULL
      AND tiktok IS NULL
      AND youtube IS NULL
      AND bandcamp IS NULL
      THEN NULL
    ELSE json_object(
      'website', website,
      'instagram', instagram,
      'facebook', facebook,
      'x', x,
      'tiktok', tiktok,
      'youtube', youtube,
      'bandcamp', bandcamp
    )
  END
  FROM extracted
)
WHERE social_links IS NOT NULL
  AND json_valid(social_links)
  AND json_type(social_links) = 'object';

-- Rebuild venue_info arrays and strip unsafe map links while preserving display data.
WITH sanitized_venues AS (
  SELECT
    e.id,
    json_group_array(
      json_object(
        'name', CASE
          WHEN trim(COALESCE(json_extract(v.value, '$.name'), '')) = '' THEN NULL
          ELSE trim(json_extract(v.value, '$.name'))
        END,
        'address', CASE
          WHEN trim(COALESCE(json_extract(v.value, '$.address'), '')) = '' THEN NULL
          ELSE trim(json_extract(v.value, '$.address'))
        END,
        'note', CASE
          WHEN trim(COALESCE(json_extract(v.value, '$.note'), '')) = '' THEN NULL
          ELSE trim(json_extract(v.value, '$.note'))
        END,
        'googleMaps', CASE
          WHEN lower(trim(COALESCE(json_extract(v.value, '$.googleMaps'), ''))) LIKE 'http://%'
            OR lower(trim(COALESCE(json_extract(v.value, '$.googleMaps'), ''))) LIKE 'https://%'
            THEN trim(json_extract(v.value, '$.googleMaps'))
          ELSE NULL
        END
      )
    ) AS sanitized_value
  FROM events e, json_each(e.venue_info) AS v
  WHERE e.venue_info IS NOT NULL
    AND json_valid(e.venue_info)
    AND json_type(e.venue_info) = 'array'
  GROUP BY e.id
)
UPDATE events
SET venue_info = (
  SELECT sanitized_value
  FROM sanitized_venues
  WHERE sanitized_venues.id = events.id
)
WHERE id IN (SELECT id FROM sanitized_venues);

-- Drop malformed band profile JSON payloads.
UPDATE band_profiles
SET social_links = NULL
WHERE social_links IS NOT NULL
  AND NOT json_valid(social_links);

-- Normalize standalone band profile photo URLs.
UPDATE band_profiles
SET photo_url = NULL
WHERE photo_url IS NOT NULL
  AND trim(photo_url) != ''
  AND lower(trim(photo_url)) NOT LIKE 'http://%'
  AND lower(trim(photo_url)) NOT LIKE 'https://%';

-- Rebuild band profile social links using only supported keys.
UPDATE band_profiles
SET social_links = (
  WITH extracted AS (
    SELECT
      CASE
        WHEN lower(trim(COALESCE(json_extract(band_profiles.social_links, '$.website'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(band_profiles.social_links, '$.website'), ''))) LIKE 'https://%'
          THEN trim(json_extract(band_profiles.social_links, '$.website'))
        ELSE NULL
      END AS website,
      CASE
        WHEN trim(COALESCE(json_extract(band_profiles.social_links, '$.instagram'), '')) = '' THEN NULL
        ELSE trim(json_extract(band_profiles.social_links, '$.instagram'))
      END AS instagram,
      CASE
        WHEN lower(trim(COALESCE(json_extract(band_profiles.social_links, '$.bandcamp'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(band_profiles.social_links, '$.bandcamp'), ''))) LIKE 'https://%'
          THEN trim(json_extract(band_profiles.social_links, '$.bandcamp'))
        ELSE NULL
      END AS bandcamp,
      CASE
        WHEN lower(trim(COALESCE(json_extract(band_profiles.social_links, '$.facebook'), ''))) LIKE 'http://%'
          OR lower(trim(COALESCE(json_extract(band_profiles.social_links, '$.facebook'), ''))) LIKE 'https://%'
          THEN trim(json_extract(band_profiles.social_links, '$.facebook'))
        ELSE NULL
      END AS facebook
  )
  SELECT CASE
    WHEN website IS NULL
      AND instagram IS NULL
      AND bandcamp IS NULL
      AND facebook IS NULL
      THEN NULL
    ELSE json_object(
      'website', website,
      'instagram', instagram,
      'bandcamp', bandcamp,
      'facebook', facebook
    )
  END
  FROM extracted
)
WHERE social_links IS NOT NULL
  AND json_valid(social_links)
  AND json_type(social_links) = 'object';