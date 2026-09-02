# Admin Roster — Data-Gap Filtering — Design Spec

**Date:** 2026-07-31
**Scope:** `frontend/src/admin/` only — no API, schema, or migration changes
**Related:** #709 (artist-link gaps across the full roster)

---

## Problem

The admin Roster tab lists 218 active artist profiles with a Links column, but
offers no way to ask "who is missing Instagram?". Filling data gaps therefore
means eyeballing 218 rows or asking someone to run SQL, which is how #709 got
written as a hand-maintained markdown table that goes stale the moment anyone
edits a profile.

Measured against production `band_profiles` on 2026-07-31 (218 active profiles):

| Field | Missing | Field | Missing |
|---|---|---|---|
| Linktree | 198 | Facebook | 140 |
| YouTube | 187 | Instagram | 94 |
| Website | 179 | Bandcamp | 79 |
| Apple Music | 173 | Photo | 196 |
| Spotify | 154 | Bio | 160 |
| | | Genre | 98 |
| | | Origin | 68 |
| | | **No links at all** | **49** |

`contact_email` is empty on all 218 and is therefore excluded — a filter that
always matches everything is noise.

## Goal

Make the roster answer "where are the blanks?" directly, and make the answer
clickable — the filter control doubles as the gap report, so the numbers above
never need to be re-derived by hand.

---

## Architecture

Everything is client-side. `RosterTab` already loads the entire roster in one
request (`bandsApi.getAll()` → `GET /api/admin/bands` with no `event_id`), and
that branch is `GROUP BY bp.id` with `LIMIT 500` — exactly one row per profile,
no join multiplication (#618). All filtering happens in the existing
`filteredBands` `useMemo`.

Three units:

1. `frontend/src/admin/utils/bandFields.js` — new. The field registry and the
   presence predicate. No React.
2. `frontend/src/admin/components/DataGapFilter.jsx` — new. Controlled popover.
3. `frontend/src/admin/RosterTab.jsx` — modified. Holds filter state, renders
   the popover and active-filter chips, and re-renders `SocialLinksIcons` from
   the registry.

---

## 1. `bandFields.js` — the shared registry

### Why it exists

`SocialLinksIcons` (`RosterTab.jsx:29`) currently hardcodes eight near-identical
JSX blocks, each pairing a field with its own URL-safety helper:
`safeInstagramHref` for Instagram, `safeHttpsFallbackHref` for Bandcamp,
`safeExternalHref` for the other six. A filter that re-derives "has Instagram"
on its own will drift from what the column renders — the column would show
nothing while the filter claims the link is present.

One registry, two consumers, no drift.

### Exports

```js
export const LINK_FIELDS = [
  { key: 'website',     label: 'Website',     resolveHref: safeExternalHref,      Icon: Globe,          hover: 'hover:text-accent-400' },
  { key: 'instagram',   label: 'Instagram',   resolveHref: safeInstagramHref,     Icon: InstagramIcon,  hover: 'hover:text-pink-400' },
  { key: 'bandcamp',    label: 'Bandcamp',    resolveHref: safeHttpsFallbackHref, Icon: BandcampIcon,   hover: 'hover:text-teal-400' },
  { key: 'facebook',    label: 'Facebook',    resolveHref: safeExternalHref,      Icon: FacebookIcon,   hover: 'hover:text-blue-400' },
  { key: 'youtube',     label: 'YouTube',     resolveHref: safeExternalHref,      Icon: YouTubeIcon,    hover: 'hover:text-red-500' },
  { key: 'spotify',     label: 'Spotify',     resolveHref: safeExternalHref,      Icon: SpotifyIcon,    hover: 'hover:text-green-400' },
  { key: 'apple_music', label: 'Apple Music', resolveHref: safeExternalHref,      Icon: AppleMusicIcon, hover: 'hover:text-rose-400' },
  { key: 'linktree',    label: 'Linktree',    resolveHref: safeExternalHref,      Icon: LinktreeIcon,   hover: 'hover:text-lime-400' },
]

export const PROFILE_FIELDS = [
  { key: 'photo_url',   label: 'Photo' },
  { key: 'genre',       label: 'Genre' },
  { key: 'origin',      label: 'Origin' },
  { key: 'description', label: 'Bio' },
]

export const GAP_FIELDS = [...LINK_FIELDS, ...PROFILE_FIELDS]

export function hasField(band, key)               // → boolean
export function hasAnyLink(band)                  // → boolean
export function countGaps(bands)                  // → { [key]: number } — how many are MISSING each field
export function matchesGapFilter(band, gapFilter) // → boolean
```

`Icon` and `hover` live in the registry so `SocialLinksIcons` can be a `.map()`.
The ordering of `LINK_FIELDS` is the existing render order of the Links column
and must be preserved so the column looks unchanged.

**The popover renders in this same registry order**, not sorted by gap count. A
list whose rows reorder as data is entered would move the checkbox out from
under the cursor mid-session. Counts are shown per row, so the biggest gaps are
still obvious without reordering.

### `hasField` — presence means "renders as a real link"

For a `LINK_FIELDS` entry: `resolveHref(links[key]) !== '#'`, where `links` comes
from the existing `parseSocialLinks(band)` (JSON-parses `band.social_links`,
returning `{}` on malformed input). **Not** "non-empty string in the DB."

This is deliberate. `safeExternalHref` returns `'#'` for anything that isn't a
parseable `http:`/`https:` URL, and `safeSocialProfileHref` rejects handles
containing whitespace or a colon. A value that sanitizes away renders nothing in
the Links column, so the filter must agree it is missing.

**Expected consequence:** the UI's "no links at all" count may read slightly
above the 49 measured by raw SQL above. That is the correct number, not a bug —
it counts artists with no *usable* link.

For `PROFILE_FIELDS`: non-empty after `String(value ?? '').trim()`, except
`origin`, which reuses `RosterTab`'s existing `formatOrigin` logic —
`[origin_city, origin_region].filter(Boolean).join(', ') || band.origin || ''`.
The API's `unpackSocialLinks` already collapses origin this way server-side, but
the client recomputes it and must stay consistent with the Origin column.

`countGaps` returns *missing* counts, matching what the popover displays.

---

## 2. Filter semantics

State shape, owned by `RosterTab`:

```js
{ mode: 'missing' | 'has', keys: string[], noLinks: boolean }
```

A band passes when:

```js
(keys.length === 0 || keys.some(k => mode === 'missing' ? !hasField(band, k) : hasField(band, k)))
&& (!noLinks || !hasAnyLink(band))
```

### Checkboxes combine as ANY, not ALL

Checking Instagram + Spotify in `missing` mode returns everyone missing
*either*. That is the union worklist — one pass down the list fills both gaps.
ALL-semantics would narrow to the worst offenders, which is the opposite of a
to-do list. `has` mode is symmetric: "has at least one of these" answers
questions like "who has any streaming presence."

The popover states this inline so the behaviour is never ambiguous: *"Matches
artists missing **any** of the checked fields."*

### "No links at all" is a separate toggle

It is the one query ANY-semantics cannot express — it means "missing all eight"
— and it is the single most useful preset (49 artists). It is ANDed on top of the
checkbox predicate rather than being a pseudo-key, which keeps the ANY rule
uniform.

### Composition with existing filters

ANDs with the existing search box and status filter, exactly as those two
already compose with each other.

---

## 3. `DataGapFilter.jsx`

Controlled component: `value={gapFilter}`, `onChange={setGapFilter}`,
`counts={gapCounts}`.

Layout — a "Data gaps" trigger button opening a popover containing:

- A Missing / Has radio pair.
- The eight link fields as checkboxes, each with its missing-count.
- A divider, then the four profile fields with counts.
- A presets footer: "No links at all", "Clear all".

### Counts are computed against the search- and status-filtered roster, but NOT against the gap filter itself

This is the design's one non-obvious rule. If counts reflected the gap filter,
checking "Instagram" would collapse every other count to reflect that selection
and the panel would stop being a dashboard the moment it was used. `RosterTab`
therefore derives counts from an intermediate `searchAndStatusFiltered` list,
one `useMemo` upstream of `filteredBands`.

### Accessibility

Matching what `RosterTab` already does elsewhere: `aria-expanded` +
`aria-controls` on the trigger, Escape closes and returns focus to the trigger,
click-outside closes, real `<label>` elements bound to each checkbox,
`min-h-[44px]` touch targets. The popover is keyboard-navigable in DOM order; no
focus trap (it is a filter, not a modal).

### Theming

Admin is dark-pinned — `AdminApp.jsx` wraps the surface in
`<div data-theme="midnight-ember">` — so the existing `text-white` /
`bg-bg-navy` idiom used throughout `RosterTab` is correct here. No semantic-token
migration; that rule applies to public pages outside `admin/`.

---

## 4. `RosterTab.jsx` changes

1. New `gapFilter` state, initialised `{ mode: 'missing', keys: [], noLinks: false }`.
2. Split the existing `filteredBands` `useMemo` (line 275) into
   `searchAndStatusFiltered` → `filteredBands`, the latter applying
   `matchesGapFilter`. Sorting is untouched.
3. Render `<DataGapFilter>` in the header controls row, beside the status select.
4. Render removable chips above the table — one per checked key (labelled
   `Missing: Instagram` / `Has: Instagram` per current mode), one for `noLinks`
   (`No links at all`), plus a plain `N artists` result count. Dismissing a chip
   removes only that key; dismissing the last one returns the roster to
   unfiltered.
5. Rewrite `SocialLinksIcons` as a `.map()` over `LINK_FIELDS`, collapsing ~100
   lines of copy-paste. Output must be structurally identical to today's: same
   order, same icons, same `size={14}`, same hover colours, same `aria-label`
   phrasing, same `-` placeholder when `hasAnyLink` is false.
6. **Optional, easily cut:** make the Links column header sortable by link count,
   so the roster can be sorted sparsest-first. ~5 lines given the registry.

`handleSelectAll` already derives from `filteredBands`, so bulk actions respect
the new filter with no change. Selections made under one filter and then
orphaned by changing it behave exactly as they already do with `statusFilter` —
pre-existing behaviour, not a regression, and out of scope.

The empty state at line 664 already reads "No artists match your filters" and
needs no change.

---

## Testing

Unit tests target `bandFields.js` and `DataGapFilter.jsx` **specifically**, not
via `RosterTab`. Frontend coverage counts only test-loaded files, so pulling an
874-line component in to test a filter tanks the global percentage under the
ratchet.

`bandFields.test.js`:
- A URL that sanitizes to `'#'` counts as missing, not present.
- An Instagram handle with a colon or whitespace counts as missing.
- A bare-domain Bandcamp value (`foo.bandcamp.com`) counts as present via `safeHttpsFallbackHref`.
- Malformed `social_links` JSON yields all-missing rather than throwing.
- `origin` falls back to the legacy `origin` string when `origin_city`/`origin_region` are null.
- ANY-combination across two keys in both modes.
- `noLinks` ANDs with the checkbox predicate.
- `countGaps` returns missing counts and is stable regardless of current selection.

`DataGapFilter.test.jsx`:
- Renders counts next to labels.
- Toggling a checkbox emits the expected `onChange` payload.
- "Clear all" resets to the initial state.
- Escape closes and restores focus to the trigger.

`RosterTab.test.jsx` (existing file, two additions):
- Selecting "missing Instagram" reduces the rendered rows to the expected set.
- Clearing the chip restores the full list.

### Gates

`make gate` (format → format-check → lint → test → build, both stacks) before
every commit, and `make review` before opening the PR.

---

## Out of scope

| Item | Reason |
|---|---|
| Filtering to one event's performers ("Vol. 17 artists missing Instagram") | The roster query keeps only each profile's *most recent* performance (`MAX(e.date)` + bare columns, `bands.js:227`), so a band on both Vol. 17 and Buddies Fest 2 carries only the latter. Needs a server change to aggregate event ids per profile — a query with documented #618 truncation history. To be filed as a follow-up issue when implementation starts. |
| `contact_email` as a filterable field | Empty on all 218 active profiles; always matches. |
| Persisting the filter to URL or localStorage | No demonstrated need. |
| Any API, schema, or migration change | None required. |
| Bulk-editing links from the filtered view | Separate feature; the gap filter is read-only triage. |
