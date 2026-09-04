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

A button that draws five artists, **weighted toward the never-seen**. Each result
is a name, its one-line identity (genre · city), and its listen link where one
exists -- so the interaction ends in music rather than in another list.

Weighting: draw from the 116 never-viewed first, then the 1-9 bucket, then
anyone. Not a hard partition -- a small chance of a well-known act keeps it from
feeling like a remainder bin.

This is the piece the owner asked for by name, and the only one that directly
attacks the 51%.

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

### 6. Recent releases, fetched rather than requested

The owner's original discovery idea included "recent bandcamp releases". Two
routes were evaluated and only one survives contact.

#### RESOLVED: Bandcamp prohibits this, so piece 6 cannot scrape

Verified 2026-09-04 by reading the Acceptable Use and Content Moderation Policy
directly (`get.bandcamp.help/articles/15263124-...`, HTTP 200), which the Terms
of Use incorporate by reference. Verbatim:

> "**Not to scrape** any text, media, or other data or content from the site,
> including through the use of scripts, robots, bots, spiders, scrapers,
> crawlers, or other automated means;
>
> Not to undertake **any form of text and/or data mining** of content, including
> where collected through the use of robots or other automated data gathering
> and/or extraction tools;"

There is no ambiguity to work with. It names scrapers and crawlers explicitly,
and "any text, other data or content" covers a release title and date -- so the
earlier distinction in this spec between "facts" and "Content" does not survive
either.

**How this spec got it wrong, recorded so the mistake is not repeated.** An
earlier revision read the Terms of Use, found no scraping clause, noted that
`robots.txt` permits artist pages, and concluded scraping was acceptable. Both
observations were true. The conclusion was wrong for two reasons: the Terms
incorporate other documents _in their own text_, so reading one was reading part
of the contract; and `robots.txt` is a crawling convention, not a grant of
permission, and never overrides a contract. A reviewer raised this twice before
it was checked properly.

`bandcamp-fetch` is a good library and this is no reflection on it. We simply
may not point it at Bandcamp.

**Remaining options for release data, both worse than the original idea:**

- **Ask the artists.** Licensed by definition, and pairs with piece 4. The owner
  expects low uptake and is probably right.
- **Spotify Web API** for the 105 artists (46%) who have a Spotify link. Licensed,
  documented, returns `release_date`. Costs: attribution and a link back to
  Spotify are required wherever their data appears, and the rail would silently
  cover under half the roster -- so artists missing from it would read as
  inactive rather than unlisted, which is the opposite of this spec's goal.

Neither is adopted here. Pieces 1-5 stand on their own and involve no third
party.

#### Constraints, all load-bearing

**It cannot run in `functions/`.** It depends on `cheerio` and `node-fetch`;
Pages Functions run on workerd, not Node. This runs as a scheduled GitHub Action
writing to D1, and the public endpoint only ever reads what that job stored.

**Store facts, not Content.** Title, release date and URL only. Bandcamp's terms
DO restrict "use, reproduction... or storage of any Content" beyond personal,
non-commercial use -- that covers artwork and descriptions. A title and a date
are facts about a release; the art is theirs. Link out for the rest.

**It will break, and it must break LOUDLY.** The library's own changelog is
"fixes adapting to site changes": Bandcamp changes markup and the scraper stops
working. The failure mode is silence -- the rail simply freezes with last
month's releases and nothing goes red. So the job needs a staleness guard: fail
when the run resolves nothing, or when the share of artists it could not parse
crosses a threshold. A scraper without one is the "green because it did not
look" class this repo keeps re-learning, on a nightly schedule.

**This piece needs a migration**, unlike the other five: somewhere to store
`artist_id`, `title`, `release_date`, `url`, `fetched_at`. A table rather than
columns, so an artist can have more than one.

#### Bandcamp Friday is the day this feature is worth the most

On Bandcamp Friday, Bandcamp waives its revenue share and the artist takes
effectively all of it. A page saying _"released recently, here is where to buy
it"_ is worth more to an artist on that specific day than on any other, which
makes it the strongest single moment for the "artists ways to be discovered"
half of this work.

So the release rail should be able to lead with it: a line acknowledging the day
and pointing at the artists with recent releases.

**Do not compute the date.** It is tempting to write "the first Friday of the
month" and be done. That is wrong -- Bandcamp announces specific dates, has
skipped months, and has changed the cadence more than once. A computed rule
would be confidently wrong on a day when being wrong is most visible, and it
would rot silently, which is the failure class this repo keeps re-learning.

Store the announced dates as configuration the owner can set, and render the
banner only when today matches one. An empty or stale list renders nothing,
which is the correct failure: a missing banner costs nothing, while a banner on
the wrong day tells every artist we are not paying attention.

#### Sequencing

Ship pieces 1-5 first. They need no migration, no third-party dependency and no
scheduled job, and they address the 116-never-viewed problem on their own. This
piece is a second pass, and its staleness guard is not optional scope.

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

**Backend** — one new public endpoint, cached with `CACHE_BROWSE` (aggregate
browse data, not show-critical):

- `GET /api/artists/shuffle?limit=5` — weighted draw, returns name, slug, genre,
  origin_city, and the best listen link.
- `GET /api/artists/one-of-one` — genres with exactly one artist.
- `GET /api/bands/:name/stage-mates` — co-performers, most-shared first.
- The artists list gains resolved link presence per row. Whether that is a new
  field on the existing `/api/artists` response or a separate call is the
  implementer's choice; it must be RESOLVED presence, not raw `social_links`.

Every one reads columns that exist. **No migration.**

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
