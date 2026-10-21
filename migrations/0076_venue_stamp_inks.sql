-- #1248: each venue gets a fixed "hand stamp" ink, constant across editions,
-- shown on poster-led event pages beside the venue's name.
--
-- Nullable: a venue with no ink renders an uncoloured stamp. New venues are
-- given the least-used ink by POST /api/admin/venues (functions/utils/venueInk.js).
ALTER TABLE venues ADD COLUMN ink_color TEXT CHECK (
  ink_color IS NULL
  OR (length(ink_color) = 7 AND ink_color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);

-- Backfill by id RANK, not by id, so any database (production, local, E2E)
-- gives its first eight venues eight different inks. The list and its order
-- must match STAMP_INKS in functions/utils/venueInk.js.
UPDATE venues
SET ink_color = CASE (
    (SELECT COUNT(*) FROM venues AS earlier WHERE earlier.id < venues.id) % 8
  )
  WHEN 0 THEN '#44505c'
  WHEN 1 THEN '#1f6b5c'
  WHEN 2 THEN '#7d5c00'
  WHEN 3 THEN '#b4432f'
  WHEN 4 THEN '#6b3f99'
  WHEN 5 THEN '#2b55a3'
  WHEN 6 THEN '#9c2f6b'
  ELSE '#3f6a12'
END
WHERE ink_color IS NULL;
