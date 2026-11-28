-- #1501: band_profiles.updated_at means "the profile's content changed".
--
-- Migration 0001's trigger fired on ANY update of a band_profiles row, and the
-- daily aggregate-stats job rewrites total_views, total_social_clicks and
-- popularity_score on every profile, so every profile's updated_at was always
-- the last stats run (measured 2026-11-24: 228 of 228). The sitemap had to stop
-- reading it for that reason.
--
-- The trigger now fires only when a CONTENT column is written. Classification
-- (functions/utils/__tests__/bandProfileUpdatedAt.test.js pins it, so a new
-- column fails until someone classifies it):
--   content (fires):  name, name_normalized, description, photo_url, genre,
--                     social_links, origin, origin_city, origin_region,
--                     contact_email, photo_alt_text, members, for_fans_of,
--                     is_active (it changes what the public sees)
--   not content:      id, created_at, updated_at (itself),
--                     created_by_user_id (attribution; users/[id].js nulls it
--                     when a user is deleted, which edits nothing on the profile),
--                     total_views, total_social_clicks, popularity_score
--                     (derived counters written by aggregate-stats)
--
-- UPDATE OF fires whenever a column appears in SET, even with an unchanged
-- value, and the admin save paths (prepareBandProfileFields, the lineup form)
-- send every content field each time. So the trigger also has a WHEN clause
-- comparing OLD and NEW per column (IS NOT, so NULL-safe): a re-save of
-- identical values, such as moving a set's time, stamps nothing.
--
-- A trigger limited by "UPDATE OF" does not fire for its own write to
-- updated_at, so it cannot recurse.
--
-- Existing updated_at values are all polluted by the old trigger and cannot be
-- recovered; they are left as they are rather than invented. They become
-- honest per profile as each one is next edited.
DROP TRIGGER IF EXISTS update_band_profile_timestamp;

CREATE TRIGGER update_band_profile_timestamp
AFTER UPDATE OF name, name_normalized, description, photo_url, genre, social_links,
  origin, origin_city, origin_region, contact_email, photo_alt_text, members,
  for_fans_of, is_active ON band_profiles
WHEN OLD.name IS NOT NEW.name
  OR OLD.name_normalized IS NOT NEW.name_normalized
  OR OLD.description IS NOT NEW.description
  OR OLD.photo_url IS NOT NEW.photo_url
  OR OLD.genre IS NOT NEW.genre
  OR OLD.social_links IS NOT NEW.social_links
  OR OLD.origin IS NOT NEW.origin
  OR OLD.origin_city IS NOT NEW.origin_city
  OR OLD.origin_region IS NOT NEW.origin_region
  OR OLD.contact_email IS NOT NEW.contact_email
  OR OLD.photo_alt_text IS NOT NEW.photo_alt_text
  OR OLD.members IS NOT NEW.members
  OR OLD.for_fans_of IS NOT NEW.for_fans_of
  OR OLD.is_active IS NOT NEW.is_active
BEGIN
  UPDATE band_profiles SET updated_at = datetime('now') WHERE id = NEW.id;
END;
