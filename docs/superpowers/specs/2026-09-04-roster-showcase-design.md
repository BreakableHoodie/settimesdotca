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

A quiet line on every artist page inviting the artist to get in touch about their
entry, routed to the existing `/contact`.

Requested by the owner alongside this work. It belongs here because a showcase
raises the stakes on the data being right, and the gaps that matter most -- a
missing genre, a wrong city, a dead link -- are the ones only the artist can
close.

## Explicitly out of scope

- **A facet rail.** That is this spec's founding lesson.
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

Every one reads columns that exist. **No migration.**

**Frontend**

- `ArtistsPage` gains a showcase block above the existing search, which is
  untouched -- it answers "is X playing?" and is the right tool for that.
- `BandProfilePage` gains "Shared a bill with" and the contact line.

## Open questions for the owner

1. **Shuffle placement:** above the A-Z list (prominent, pushes the roster down)
   or beside the search (quieter)? _Recommendation: above — the point is that it
   is seen._
2. **Does "one of one" need its own page,** or is a rotating single callout
   enough? _Recommendation: a callout first; a page only if it earns one._
3. **The contact line's wording** is the owner's call. It is his relationship
   with these artists, not ours.

## Dependencies

- #1091 (members / "for fans of" fields) would enrich the artist page but does
  **not** block any of this.
