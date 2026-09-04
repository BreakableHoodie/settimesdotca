# Showcase the roster on /artists

**Status:** proposed, awaiting approval
**Issue:** #1098
**Supersedes:** the artist-discovery design of 2026-09-03, which proposed a facet
rail and was rejected as redundant. That rejection is the starting point here.

## The correction this spec is built on

The first attempt proposed filtering `/artists` by Sound, From and History. The
owner's response was that it is _"truly redundant"_, and it is. Look at what the
page already prints for every artist:

```text
Adelleda
Punk · Hamilton, ON
1 show
```

Genre, city and show count are on every row, above a search field and an A-Z
index. A facet rail would let a fan narrow by the exact three things the page has
already told them. It adds a control surface and reveals nothing.

The ask was never _"help me narrow 227 down"_. It was, in the owner's words,
**"creative ways to showcase all the artists"**. Showcase, not filter. That is a
different problem, and the earlier spec solved the wrong one.

## The number that should drive the design

| Signal                                            | Value                |
| ------------------------------------------------- | -------------------- |
| **Artists whose page has never been viewed once** | **116 of 227 (51%)** |
| Artists with 1-9 views                            | 100                  |
| Artists with 10+ views                            | 11 (most-viewed: 45) |

**Half the roster has never been looked at.** Not "rarely" -- never. That is the
problem worth solving, and it reframes every feature below: the job is not to
help someone find a band they already have in mind, it is to put the other 116
in front of anyone at all.

It also settles the shuffle's weighting on its own. An unweighted random draw
re-surfaces whatever is already visible; weighting toward the unseen is the only
version that changes that number.

## What the data will and will not support

Measured against production on 2026-09-04.

| Field                                | Coverage             | Consequence                                    |
| ------------------------------------ | -------------------- | ---------------------------------------------- |
| `origin_city`                        | **181 / 227 (80%)**  | Best-covered field. 73 are Waterloo Region.    |
| Bandcamp link                        | **183 / 227 (81%)**  | Discovery can end in _hearing_ something.      |
| `genre`                              | 164 / 227 (72%)      | 66 tags, **42 of them on exactly one artist**. |
| `description` (bio)                  | 75 / 227 (33%)       | Too thin to carry a layout.                    |
| `photo_url`                          | **26 / 227 (11%)**   | **Any photo grid renders as placeholders.**    |
| Performances linked to a profile     | **298 / 298 (100%)** | The co-performance graph has no holes.         |
| Co-performance pairs                 | **4,730**            |                                                |
| Artists with at least one stage-mate | **227 / 227**        | "Shared a bill" can never render empty.        |
| Artists with more than one edition   | 46                   | "Returning" is real and populated.             |

Three of these are load-bearing:

**Photos are 11%, and band photos are a deprioritised backlog item.** So the
surface must be typographic. That is a constraint, not a compromise: 227 names
set well scan better on a phone than 227 cards, most of which would be initials.

**Every performance resolves to a profile, and every artist has a stage-mate.**
That is what makes "shared a bill with" trustworthy _and_ universal -- no artist
gets an empty section, and a fan cannot mistake a missing edge for a real one.

**42 of 66 genre tags belong to a single artist.** The tail is the catalogue:
Frog Funk, Desert Rock, Art Folk, Comedy Rock, Drag. It is the most interesting
thing in the data and the least suited to a filter.

## The design

Four pieces, ordered by how much they move the 116.

### 1. Shuffle five

A button drawing five artists, weighted toward the never-seen.

**The contract, stated precisely** — an earlier draft said "draw from the 116
never-viewed first, then the 1-9 bucket, then anyone" AND "not a hard
partition", which are opposite instructions. An implementer had to guess. The
rule is a weighted draw, not staged selection:

- Weight each active artist by view count: `total_views = 0` -> weight 6,
  `1..9` -> weight 3, `10+` -> weight 1.
- Draw `limit` artists **without replacement**, so five results are five
  distinct artists.
- No bucket is a gate. A well-known act can appear; it is simply six times less
  likely than an unseen one. That is what stops the feature reading as a
  remainder bin while still moving the 116.
- If fewer than `limit` artists are eligible, return what exists. Do not pad,
  and do not repeat.
- `total_views` is read live from `band_profiles`; there is no snapshot to go
  stale.

**Eligibility is the public roster's, not a new rule.** `/api/artists` already
excludes artists attached only to draft events. These routes reuse that gate via
`publicEventStatusSql()` rather than restating it, so an unannounced lineup
cannot leak through a discovery endpoint. Each route tests the draft-exclusion
case.

**Not cached.** `CACHE_BROWSE` is `public, max-age=300` and the URL never
changes, so a browser would serve the same five artists for five minutes: a
shuffle that does not shuffle. The response is `no-store`. Not a shorter
max-age -- any non-zero window is a window in which the button does nothing.
The other two routes are stable aggregates and correctly keep the tier.

**Listen links reuse the existing contract**, they do not define a second one.
`functions/api/artists.js` sanitises through `normalizeHttpUrl`; `ArtistsPage`
applies `safeExternalHref`, prefers Bandcamp over Spotify, and renders nothing
for a value resolving to `#`. The shuffle result carries the same resolved link
under the same priority, and omits the anchor entirely when nothing resolves.

### 2. One of one

The 42 single-artist genres, surfaced as an invitation rather than a filter:

> **One of one** — exactly one artist here plays Frog Funk.

A tag with n=1 and a tag with n=25 do different jobs. `Punk (25)` is a browse
axis nobody needs; `Frog Funk (1)` is a reason to click. This costs one query
and turns the least filterable part of the data into the most interesting.

### 3. Shared a bill

On an artist's page: who they have played with, from the 4,730-pair graph.

A **fact about the bills**, never an inferred similarity score. That distinction
is the whole reason it is trustworthy, and it is why no taste modelling appears
in this spec.

### 4. Artists can correct their own page

On the individual artist profile (`/band/<slug>`) -- the page an artist lands on
when they look themselves up, and the only one where they can see what we got
wrong. Approved wording:

> **Is this your band?** Tell us if anything is wrong - genre, hometown, links.

Links to `/contact`, which already has a "Corrections & takedowns" section, so
the language matches where it sends them.

Three deliberate properties:

- **It self-selects in three words.** Most readers of an artist page are fans.
  "Is this your band?" lets everyone else skip it, which is what keeps it quiet
  rather than clutter.
- **It names what is fixable.** A vague "let us know" gets nothing. Naming genre,
  hometown and links steers reports at the three actual gaps -- 62 artists with
  no genre, 46 with no city, and the dead links the href resolver silently drops
  -- which are the same fields piece 5 is about to make visible.
- **It promises no turnaround.** No "we will update within 48 hours". One person
  runs this.

Cheap insurance, not a data strategy: it costs one line and occasionally catches
something only the band could know. Piece 6 is what actually fills release data.

### 5. Show what an artist is ON, and let a fan slice by it

The roster prints genre, city and show count. It prints **nothing** about where
you can hear or follow an artist -- you have to open each profile to find out.
That is why this is not the facet rail: it reveals something the page has never
said.

Coverage across all eight link fields, measured 2026-09-04:

| field       | artists |     |
| ----------- | ------- | --- |
| bandcamp    | 183     | 81% |
| instagram   | 155     | 68% |
| facebook    | 142     | 63% |
| website     | 138     | 61% |
| apple_music | 107     | 47% |
| spotify     | 105     | 46% |
| linktree    | 97      | 43% |
| youtube     | 93      | 41% |

**Nothing here is rare**, so no single platform is a strong _narrowing_ tool --
the range is 41% to 81%. The value is the other direction: a fan who lives in
one platform can see their half of the roster, and everyone else can finally
tell from the list whether there is anything to listen to.

So both halves ship together, and the first matters more:

- **On the row:** the artist's links, as the compact icon set the admin roster
  already uses. This is the piece that closes the gap.
- **Above the list:** a toggle per platform, each showing its count, so picking
  one is an informed choice rather than a guess. Multi-select, AND-combined.

#### The constraint that decides correctness

**Presence must be resolved, never inferred from the stored value.** A link is
present only if it resolves to a real href -- `resolveHref(value) !== '#'` --
because `safeSocialProfileHref` rejects any handle containing whitespace or a
colon, so a value can be non-empty in D1 and render nothing.

Counting `social_links LIKE '%"bandcamp"%'` would therefore claim an artist "has
Bandcamp" while their row shows no icon. That is exactly the bug #712 fixed, and
CLAUDE.md names it: anything asking "does this artist have Instagram?" goes
through `hasField()` / `hasAnyLink()` / `countLinks()` in
`frontend/src/admin/utils/bandFields.js`, never at `social_links` directly.

**The counts in the table above are key-presence counts and are therefore an
upper bound.** The real numbers must be computed through the resolver, and the
implementation must not reuse those figures.

The server-side companion is `BAND_LINK_FIELD_KEYS` in
`functions/utils/bandLinkFields.js`. Adding a ninth platform means both homes
plus `sanitizeBandSocialLinks`; do not introduce a third list here.

### 6. Recent releases — investigated and NOT adopted

The owner's original idea included "recent bandcamp releases", later sharpened to
sorting and filtering the roster by release recency. Every route was evaluated.
None works, and the reasons differ.

| Source                             | Verdict                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrape Bandcamp (`bandcamp-fetch`) | **Prohibited.** The Acceptable Use and Content Moderation Policy, incorporated into the Terms of Use, forbids scraping "through the use of scripts, robots, bots, spiders, scrapers, crawlers, or other automated means" and "any form of text and/or data mining".                                            |
| Bandcamp official API              | Account, Sales Report and Merch Orders only, restricted to account holders reading their own data behind an eligibility check. 183 artists would mean 183 OAuth grants.                                                                                                                                        |
| `isitbandcampfriday.com`           | Bandcamp's own site (assets on `s4.bcbits.com`, Bandcamp footer). Same policy.                                                                                                                                                                                                                                 |
| Spotify Web API                    | Fetching is fine. **Storing is not**: "you may not store, aggregate or create compilations or databases of Spotify Content", "Do not store Spotify Content indefinitely", caching "limited to the temporary caching of metadata". Sorting a roster REQUIRES a persistent index, which is the prohibited thing. |
| Apple Music API                    | Requires paid Apple Developer Program membership. Storage terms not verified.                                                                                                                                                                                                                                  |
| MusicBrainz                        | Legal and open, but coverage for small local acts is expected to be poor.                                                                                                                                                                                                                                      |

**The argument that settles it needs none of the above.** Spotify covers 105 of
227 artists (46%); Apple Music 107 (47%). So even with permissive terms and a
paid membership, a "sort by recent release" view ranks **fewer than half the
roster** and silently omits the rest.

That is not a partial feature, it is a misleading one. Absence would read as
"has not released anything" when the truth is "we could not see them" -- and the
artists who vanish are disproportionately the smaller ones with no Spotify or
Apple presence. Which is to say: **the 116 who have never been viewed**, the
exact people this document exists to surface. The feature would point the best
idea in it at the wrong half of the roster.

**What replaces it.** Nothing, directly. What already covers the intent:

- Piece 5's link icons put a Bandcamp link in front of a fan for 183 artists
  (81%) -- linking out is not scraping, and it is what Bandcamp wants.
- The Bandcamp Friday banner (dates entered by the owner, never computed) turns
  those links into the moment they are worth the most.
- Piece 4's contact line is the only fully-licensed release channel there is:
  the artist telling us.

Revisit only if Bandcamp ships a public catalogue API, or if a single source
ever reaches coverage where absence stops being a lie.

## Explicitly out of scope

- **A facet rail over genre, city or show count.** That is this spec's founding
  lesson: the page already prints all three on every row. Note the contrast with
  piece 5 -- filtering by link presence is fine precisely because the row has
  never shown it.
- **Taste-based recommendations.** "Shared a bill" is a fact; a similarity score
  is a guess, and a wrong guess about an artist's music is worse than none.
- **AI-written bios.** Standing rule: structured facts are ours to research;
  prose representing an artist is not ours to write.
- **Photo-driven layouts.** 11%.
- **Rewriting anyone's genre in the database.** If tags ever need grouping, do it
  at query time and always render the artist's own words.

## Implementation shape

Deliberately small, so it can be delegated in one pass.

**Backend** — three new public read-only endpoints, plus a field on an existing
one. No migration.

- `GET /api/artists/shuffle?limit=5` — weighted draw per the contract above.
  `no-store`.
- `GET /api/artists/one-of-one` — genres belonging to exactly one artist.
  `CACHE_BROWSE`.
- `GET /api/bands/[name]/stage-mates` — co-performers, most-shared first.
  `CACHE_BROWSE`.
- `/api/artists` gains RESOLVED link presence per artist.

**Identity: use the canonical band id, never a display name.** Artist names in
this roster include `$wamp A$$`, `THE FRIENDLY FROGS FREAK SHOW` and names with
slashes and apostrophes. `stage-mates` resolves its `[name]` segment through the
same normalisation `functions/api/bands/[name].js` already uses -- reusing that
lookup, not writing a second one -- and every artist it RETURNS carries the
numeric `band_profiles.id`, so a caller never has to round-trip through a
display name to ask a follow-up question.

The same applies to the contact link in piece 4: it carries the artist's
canonical id, so a correction can be tied to a record rather than to whatever
the artist typed. A bare `/contact` link cannot identify the profile, which is
the difference between a report we can act on and one we cannot.

**Frontend**

- `ArtistsPage` gains a showcase block above the existing search, which is
  untouched -- it answers "is X playing?" and is the right tool for that.
- Each roster row gains the compact link icons the admin roster already renders,
  and the list gains per-platform toggles with counts.
- `BandProfilePage` gains "Shared a bill with" and the approved contact line.

## Open questions for the owner

1. **Shuffle placement:** above the A-Z list (prominent, pushes the roster down)
   or beside the search (quieter)? _Recommendation: above — the point is that it
   is seen._
2. **Does "one of one" need its own page,** or is a rotating single callout
   enough? _Recommendation: a callout first; a page only if it earns one._
3. ~~The contact line's wording~~ **Decided**: option A, on the artist profile
   page. See piece 4.

## Dependencies

- #1091 (members / "for fans of" fields) would enrich the artist page but does
  **not** block any of this.
