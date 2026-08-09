-- Backfill apple_music links for artists that already had a Spotify link.
--
-- Run manually (this is data, not schema — it does NOT belong in migrations/,
-- which auto-apply on deploy):
--
--   npx wrangler d1 execute settimes-production-db --remote \
--     --file=scripts/backfill-apple-music-links.sql
--
-- Every statement is guarded on apple_music still being blank, so a re-run is
-- a no-op and this can never clobber a link entered by hand in the meantime.
--
-- Identity was proven by DISCOGRAPHY MATCH against each artist's Bandcamp or
-- Spotify releases, never by artist-name match alone — the same "existence is
-- not identity" doctrine as scripts/probe-band-links.mjs. That mattered: an
-- Apple name search returns 12 exact "Aversion" hits and 11 exact "Uppercut"
-- hits, so a name-only pass would have written wrong links to live profiles.
--
-- URL shape follows the existing majority convention (63 of 74 rows):
-- https://music.apple.com/ca/artist/<slug>/<id> — CA storefront, no ?uo=4
-- affiliate suffix.
--
-- Deliberately NOT included:
--   Ghost Factory (217) — verified absent from Apple Music. The only exact-name
--     hit is an unrelated hip-hop artist, and their release "Socialist Trash"
--     returns nothing. A blank field is correct here.
--   GZ (68) — its existing SPOTIFY link resolves to a different artist
--     ("THE OUTCAST"); pending owner confirmation of a rename. Untouched.

-- BA Johnston — Hamilton. Proof: "Stairway to Hamilton", "Argos Suck",
-- "Werewolves of London, Ontario" all present in Apple's catalog for this id.
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/ba-johnston/287135498'),
    updated_at = datetime('now')
WHERE id = 31 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Aversion — Stratford ON. Proof: 4/4 vs aversionfc.bandcamp.com. Bandcamp's
-- "JMBME" is the acronym of Apple's "Judge Me By My Enemies"; plus
-- "Festival City EP", "Throwaway Kids", "End Days".
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/aversion/1780235898'),
    updated_at = datetime('now')
WHERE id = 86 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Rhx34 — proof: 10/10 vs the Spotify discography already on file, including
-- "LOVE_LETTER_FOR_YOU.TXT.vbs" and "the king of ur basement".
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/rhx34/1733310855'),
    updated_at = datetime('now')
WHERE id = 82 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Rolodex Darko — Hamilton. Proof: "SLUT QUEEN" and
-- "BLIND IN THE VALLEY OF SUICIDES" vs rolodexdarko.bandcamp.com.
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/rolodex-darko/1588638207'),
    updated_at = datetime('now')
WHERE id = 85 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Uppercut — proof: 3/3 vs the Spotify discography already on file
-- ("Sleepwalker", "All My Big Dawgs Go to Heaven", "Bond, Trauma Bond").
-- Apple returns 11 unrelated exact-name "Uppercut" artists; this is the one.
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/uppercut/1840778173'),
    updated_at = datetime('now')
WHERE id = 80 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Nova Doll — Barrie ON. Proof: "Denaturing", "California Sunshine",
-- "Waydown" vs novadoll.bandcamp.com. (A second exact-name match is a
-- house/electronica act — not this band.)
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/nova-doll/1678067458'),
    updated_at = datetime('now')
WHERE id = 195 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Ship of Fools — Newmarket ON, punk. Proof: 4/4 vs sofpunk.bandcamp.com
-- ("A Perfect Place for Harmony", "Broken Knuckles", "Status Quo",
-- "The Basement Demos"). Found by searching the RELEASE title — the artist-name
-- search surfaced an unrelated blues act instead.
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/ship-of-fools/1252054276'),
    updated_at = datetime('now')
WHERE id = 193 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Working Girl — Hamilton, metal. Proof: 2/2 vs the Spotify discography
-- already on file ("New Development" 2026, "Working Girl" 2024), genre and
-- city both consistent with workinggirl.bandcamp.com.
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/working-girl/1715549798'),
    updated_at = datetime('now')
WHERE id = 194 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';

-- Alert the Audience — Brantford ON. Proof: 3/4 vs
-- alerttheaudience.bandcamp.com ("WE'LL DO IT LIVE!!!", "Here, I Made This",
-- "This Is An EP").
UPDATE band_profiles
SET social_links = json_set(COALESCE(social_links, '{}'), '$.apple_music',
      'https://music.apple.com/ca/artist/alert-the-audience/1417631689'),
    updated_at = datetime('now')
WHERE id = 105 AND TRIM(COALESCE(json_extract(social_links, '$.apple_music'), '')) = '';
