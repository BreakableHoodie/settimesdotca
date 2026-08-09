-- Repair streaming links that point at the WRONG ARTIST (see issue #788).
--
-- Run manually (data, not schema — belongs in scripts/, never migrations/):
--
--   npx wrangler d1 execute settimes-production-db --remote \
--     --file=scripts/fix-wrong-artist-links.sql
--
-- The audit flagged 6 links on 5 profiles; this patch repairs 5 on 4. GZ (68)
-- is excluded on later evidence — see the note in the REMOVED section.
--
-- Found by auditing all 156 streaming links for identity rather than presence.
-- hasField() in bandFields.js can only prove a link resolves to a real href;
-- it cannot prove the href points at the right artist, so these were invisible
-- to every existing check while live on public profile pages.
--
-- Three of the five pointed at OTHER BANDS IN THIS ROSTER (Dead Roots is 142,
-- Dead Karma is 108, Avro Arrows is 186), and 132 + 186 shared a byte-identical
-- Spotify id — the signature of row misalignment during a bulk entry pass.
--
-- Each statement is guarded on the known-wrong platform ID still being present,
-- so a re-run is a no-op and a hand-fix made in the meantime is never clobbered.
-- Guards match the ID substring, not the whole URL, because the stored Apple
-- storefront prefix varies (/ca/, /us/, /kz/) across rows.
--
-- They use GLOB, not LIKE, deliberately. SQLite's LIKE is case-INSENSITIVE for
-- ASCII, but Spotify and Apple ids are base62 and case-significant: a LIKE
-- guard would also match a case-variant of the id, which is a different and
-- perfectly valid id, and could clobber a link this patch never meant to touch.
-- GLOB is case-sensitive. (No id contains *, ?, or [, so GLOB's wildcards are
-- safe here.) Caught by CodeRabbit; there is a regression test for it.
--
-- A blank field is strictly better than a stranger's music: where no correct
-- link could be proven, the key is REMOVED rather than guessed at. Those
-- profiles will then show up correctly in the roster gap filter as missing.

-- === REPLACED (correct links proven) ===

-- Man Made Hill (67) — both links pointed at "Mark It Zero".
-- Correct Apple id 497145490 proven 4/4 against manmadehill.bandcamp.com
-- ("Delicious Logo", "Mirage Repair", "Mass Wasting", "Totally Regular"),
-- Hamilton ON, genre Electronic. Spotify id confirmed via oEmbed title.
UPDATE band_profiles
SET social_links = json_set(social_links, '$.spotify',
      'https://open.spotify.com/artist/1TujiBxIcuZG5m6hu52RNP'),
    updated_at = datetime('now')
WHERE id = 67 AND COALESCE(json_extract(social_links, '$.spotify'), '') GLOB '*57bkC3zB6VcK1K7AHIh4fd*';

UPDATE band_profiles
SET social_links = json_set(social_links, '$.apple_music',
      'https://music.apple.com/ca/artist/man-made-hill/497145490'),
    updated_at = datetime('now')
WHERE id = 67 AND COALESCE(json_extract(social_links, '$.apple_music'), '') GLOB '*1540041962*';

-- === REMOVED (no correct link could be proven) ===
-- Each of these three HAS a correct apple_music link already on file; only the
-- spotify key was wrong, so only that key is removed.

-- GZ (68) is DELIBERATELY NOT TOUCHED.
--
-- Its spotify link resolves to "THE OUTCAST", which read as wrong until the
-- follow-up sweep checked the rest of the row: GZ's own bio describes a
-- "bilingual artist from the southern part of India", and THE OUTCAST's
-- catalogue is Tamil ("Villayattam", "Immortal Sangham"). That is consistent
-- with a rename, not a mis-paste — so the LINK is likely correct and the
-- profile NAME is what's stale.
--
-- Removing a correct link would be a regression, and unlike the four below
-- this row shows no sign of the bulk-entry misalignment (its instagram,
-- genre and city are all self-consistent). Left for the owner to confirm.

-- Dead Karma (108) — pointed at "DEAD ROOTS" (which is profile 142).
UPDATE band_profiles
SET social_links = json_remove(social_links, '$.spotify'),
    updated_at = datetime('now')
WHERE id = 108 AND COALESCE(json_extract(social_links, '$.spotify'), '') GLOB '*4FLg7ZoBc37HAokjDEEAKm*';

-- Azathoth Entombed (132) — pointed at "Avro Arrows" (profile 186), which
-- still holds this same id legitimately. Removing it here resolves the
-- duplicate; 186 is left untouched.
UPDATE band_profiles
SET social_links = json_remove(social_links, '$.spotify'),
    updated_at = datetime('now')
WHERE id = 132 AND COALESCE(json_extract(social_links, '$.spotify'), '') GLOB '*1gG9HaBRUlgguK7KzSDRfo*';

-- A Dallas Welcome (234) — pointed at "Dead Karma" (profile 108).
UPDATE band_profiles
SET social_links = json_remove(social_links, '$.spotify'),
    updated_at = datetime('now')
WHERE id = 234 AND COALESCE(json_extract(social_links, '$.spotify'), '') GLOB '*6oku69hBJT9zSgzBUdqT3y*';
