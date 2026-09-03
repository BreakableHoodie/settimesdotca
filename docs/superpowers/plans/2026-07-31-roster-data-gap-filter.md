# Roster Data-Gap Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin filter the Roster tab by presence/absence of artist links and profile fields, so the 218-profile roster answers "who is missing Instagram?" directly.

**Architecture:** Entirely client-side. `RosterTab` already loads the full roster in one request. A new `bandFields.js` registry defines every filterable field, its label, and its presence predicate — and backs both the Links column and the filter, so the two cannot disagree. A controlled `DataGapFilter` popover shows live missing-counts per field. `RosterTab` composes the new predicate into its existing filter chain.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Vitest + @testing-library/react, PropTypes.

**Spec:** `docs/superpowers/specs/2026-07-31-roster-data-gap-filter-design.md`

## Global Constraints

- **No API, schema, or migration changes.** Everything is `frontend/src/admin/`.
- **Admin is dark-pinned.** `AdminApp.jsx` wraps the surface in `<div data-theme="midnight-ember">`, so `text-white` / `bg-bg-navy` are correct here. Do **not** migrate admin code to semantic theme tokens — that rule applies only to public pages outside `admin/`.
- **Never build a Tailwind class by interpolation.** Tailwind v4 scans source text for complete class literals and never evaluates template expressions. `` `hover:text-${c}` `` silently produces no CSS. Every Tailwind class must appear verbatim in a source file.
- **Presence means "resolves to a real href"**, i.e. `resolveHref(value) !== '#'` — never `value !== ''`. A stored value that sanitizes away renders nothing in the Links column and must count as missing.
- **Touch targets:** interactive controls use `min-h-[44px]`, matching the rest of `RosterTab`.
- **Test imports:** `import { describe, expect, it, vi } from 'vitest'` explicitly, even though `globals: true` — matches every existing test file.
- **`RosterTab` renders the desktop table AND the mobile card list unconditionally** (visibility is CSS-only via `hidden md:block` / `md:hidden`). Every text query in a `RosterTab` test matches twice — always use `getAllBy*` / `queryAllBy*`, never `getByText`.
- **Coverage thresholds** (`frontend/vitest.config.js`): statements 57, branches 50, functions 60, lines 58. Never lower them.
- **Gate before every commit:** `make gate`. Do not commit if it fails.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/admin/utils/bandFields.js` | Create | Field registry + presence predicates. No JSX. |
| `frontend/src/admin/utils/__tests__/bandFields.test.js` | Create | Unit tests for predicates and counts. |
| `frontend/src/admin/components/SocialLinksIcons.jsx` | Create | The Links-column cell, moved out of `RosterTab`. |
| `frontend/src/admin/components/__tests__/SocialLinksIcons.test.jsx` | Create | Characterization test — locks current render behaviour. |
| `frontend/src/admin/components/DataGapFilter.jsx` | Create | Controlled filter popover. |
| `frontend/src/admin/components/__tests__/DataGapFilter.test.jsx` | Create | Component tests. |
| `frontend/src/admin/RosterTab.jsx` | Modify | Filter state, memo chain, chips. Loses ~130 lines. |
| `frontend/src/admin/__tests__/RosterTab.test.jsx` | Modify | Two integration tests. |

**Build order rationale:** Task 1 extracts the Links cell *verbatim* and pins its behaviour with a test, before Task 3 rewrites its internals. That converts the riskiest change in the plan (rewriting 100 lines of working render code that no test currently guards) into a provably behaviour-preserving one.

---

### Task 1: Extract `SocialLinksIcons` verbatim + characterization test

Pure move. **No behaviour change, no logic change.** Copy the code exactly as it is today so the characterization test in this task pins current behaviour, not intended behaviour.

**Files:**
- Create: `frontend/src/admin/components/SocialLinksIcons.jsx`
- Create: `frontend/src/admin/components/__tests__/SocialLinksIcons.test.jsx`
- Modify: `frontend/src/admin/RosterTab.jsx` — delete lines 19–152 (`parseSocialLinks` + `SocialLinksIcons`), add an import

**Interfaces:**
- Produces: `default export function SocialLinksIcons({ band })` and `export function parseSocialLinks(band)`

- [ ] **Step 1: Create the new component file by moving code verbatim**

Create `frontend/src/admin/components/SocialLinksIcons.jsx`. Move `parseSocialLinks` (currently `RosterTab.jsx:19-27`) and `SocialLinksIcons` (currently `RosterTab.jsx:29-152`) into it **unchanged**, adjusting only the import paths (one `../` becomes `../../`) and adding `export default` to `SocialLinksIcons` plus `export` on `parseSocialLinks`:

```jsx
import { Globe } from 'lucide-react'
import PropTypes from 'prop-types'
import { safeExternalHref, safeHttpsFallbackHref, safeInstagramHref } from '../../utils/urlSafety'
import {
  AppleMusicIcon,
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  LinktreeIcon,
  SpotifyIcon,
  YouTubeIcon,
} from '../../components/ui/SocialIcons'

export function parseSocialLinks(band) {
  let links = {}
  try {
    links = typeof band.social_links === 'string' ? JSON.parse(band.social_links) : band.social_links || {}
  } catch (_e) {
    /* ignore */
  }
  return links
}

export default function SocialLinksIcons({ band }) {
  // ... body copied verbatim from RosterTab.jsx:30-151 ...
}

SocialLinksIcons.propTypes = {
  band: PropTypes.object.isRequired,
}
```

The body is the existing 122 lines unchanged — all eight `href !== '#'` blocks in their current order (website, instagram, bandcamp, facebook, youtube, spotify, apple_music, linktree), the `hasAnyLink` early return with `<span className="text-white/30">-</span>`, all existing `title` and `aria-label` strings.

- [ ] **Step 2: Wire it into RosterTab**

In `frontend/src/admin/RosterTab.jsx`, delete lines 19–152 and the now-unused imports (`Globe`, the seven `SocialIcons`, and the three `urlSafety` helpers — verify none are used elsewhere in the file first with a grep). Add:

```jsx
import SocialLinksIcons from './components/SocialLinksIcons'
```

- [ ] **Step 3: Write the characterization test**

Create `frontend/src/admin/components/__tests__/SocialLinksIcons.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SocialLinksIcons, { parseSocialLinks } from '../SocialLinksIcons'

const ALL_LINKS = {
  website: 'https://example.com',
  instagram: '@testband',
  bandcamp: 'testband.bandcamp.com',
  facebook: 'https://facebook.com/testband',
  youtube: 'https://youtube.com/@testband',
  spotify: 'https://open.spotify.com/artist/abc',
  apple_music: 'https://music.apple.com/ca/artist/testband/1',
  linktree: 'https://linktr.ee/testband',
}

const bandWith = links => ({ name: 'Test Band', social_links: JSON.stringify(links) })

describe('SocialLinksIcons — characterization', () => {
  it('renders all eight links with their exact aria-labels, in column order', () => {
    render(<SocialLinksIcons band={bandWith(ALL_LINKS)} />)

    const expectedOrder = [
      'Open website for Test Band',
      'Open Instagram for Test Band',
      'Open Bandcamp for Test Band',
      'Open Facebook for Test Band',
      'Open YouTube for Test Band',
      'Open Spotify for Test Band',
      'Open Apple Music for Test Band',
      'Open Linktree for Test Band',
    ]
    const rendered = screen.getAllByRole('link').map(a => a.getAttribute('aria-label'))
    expect(rendered).toEqual(expectedOrder)
  })

  it('resolves each href through its own safety helper', () => {
    render(<SocialLinksIcons band={bandWith(ALL_LINKS)} />)

    // Bare handle -> full profile URL (safeInstagramHref)
    expect(screen.getByLabelText('Open Instagram for Test Band')).toHaveAttribute(
      'href',
      'https://instagram.com/testband',
    )
    // Bare domain -> https:// prefixed (safeHttpsFallbackHref)
    expect(screen.getByLabelText('Open Bandcamp for Test Band')).toHaveAttribute(
      'href',
      'https://testband.bandcamp.com/',
    )
  })

  it('opens every link in a new tab with a safe rel', () => {
    render(<SocialLinksIcons band={bandWith(ALL_LINKS)} />)
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('omits a link whose value sanitizes to "#"', () => {
    render(<SocialLinksIcons band={bandWith({ ...ALL_LINKS, website: 'javascript:alert(1)' })} />)
    expect(screen.queryByLabelText('Open website for Test Band')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(7)
  })

  it('renders a dash placeholder when no link resolves', () => {
    render(<SocialLinksIcons band={bandWith({})} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('treats malformed social_links JSON as no links', () => {
    render(<SocialLinksIcons band={{ name: 'Test Band', social_links: 'not json' }} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('parseSocialLinks accepts an already-parsed object', () => {
    expect(parseSocialLinks({ social_links: { website: 'https://example.com' } })).toEqual({
      website: 'https://example.com',
    })
  })
})
```

- [ ] **Step 4: Run the new test and the existing roster test**

Run: `cd frontend && npx vitest run src/admin/components/__tests__/SocialLinksIcons.test.jsx src/admin/__tests__/RosterTab.test.jsx`
Expected: PASS — all 7 new tests plus the 3 existing ones. This is a pure move, so nothing should go red.

If `Open Bandcamp` fails on a trailing-slash mismatch, read `safeExternalHref` in `frontend/src/utils/urlSafety.js:1` — it returns `new URL(...).toString()`, which normalizes a bare origin to a trailing slash. Fix the *expectation* to match reality; do not change the helper.

- [ ] **Step 5: Run the full gate**

Run: `make gate`
Expected: exit 0. Do not proceed if it fails.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/components/SocialLinksIcons.jsx \
        frontend/src/admin/components/__tests__/SocialLinksIcons.test.jsx \
        frontend/src/admin/RosterTab.jsx
git commit -m "refactor(admin): extract SocialLinksIcons from RosterTab, pin behaviour with tests

Pure move, no logic change. The Links column had no test coverage at all
(the one e2e test that covered it is test.skip'd), so it is characterized
here before the registry refactor rewrites its internals.

Also the first test to actually invoke the SocialIcons components, which
RosterTab.test.jsx has been loading into the coverage denominator without
ever rendering.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The `bandFields.js` registry

**Files:**
- Create: `frontend/src/admin/utils/bandFields.js`
- Create: `frontend/src/admin/utils/__tests__/bandFields.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `LINK_FIELDS: Array<{ key, label, ariaNoun, resolveHref, Icon, accent }>`
  - `PROFILE_FIELDS: Array<{ key, label }>`
  - `GAP_FIELDS: Array` — `[...LINK_FIELDS, ...PROFILE_FIELDS]`
  - `NO_LINKS_KEY: string`
  - `LINK_BASE_CLASS: string`
  - `EMPTY_GAP_FILTER: { mode: 'missing', keys: [], noLinks: false }`
  - `parseSocialLinks(band) -> object`
  - `formatOrigin(band) -> string`
  - `hasField(band, key) -> boolean`
  - `hasAnyLink(band) -> boolean`
  - `countLinks(band) -> number`
  - `countGaps(bands) -> Record<string, number>`
  - `matchesGapFilter(band, gapFilter) -> boolean`
  - `isGapFilterActive(gapFilter) -> boolean`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/admin/utils/__tests__/bandFields.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  GAP_FIELDS,
  LINK_FIELDS,
  NO_LINKS_KEY,
  countGaps,
  countLinks,
  formatOrigin,
  hasAnyLink,
  hasField,
  isGapFilterActive,
  matchesGapFilter,
  parseSocialLinks,
} from '../bandFields'

const band = (links = {}, extra = {}) => ({
  name: 'Test Band',
  social_links: JSON.stringify(links),
  ...extra,
})

describe('parseSocialLinks', () => {
  it('parses a JSON string', () => {
    expect(parseSocialLinks(band({ website: 'https://example.com' }))).toEqual({
      website: 'https://example.com',
    })
  })

  it('passes through an already-parsed object', () => {
    expect(parseSocialLinks({ social_links: { spotify: 'x' } })).toEqual({ spotify: 'x' })
  })

  it('returns {} for malformed JSON instead of throwing', () => {
    expect(parseSocialLinks({ social_links: '{oops' })).toEqual({})
  })

  it('returns {} for the literal string "null", which JSON.parse turns into null', () => {
    expect(parseSocialLinks({ social_links: 'null' })).toEqual({})
  })

  it('returns {} for a missing band', () => {
    expect(parseSocialLinks(undefined)).toEqual({})
  })
})

describe('hasField — links resolve through their safety helper', () => {
  it('counts a valid https website as present', () => {
    expect(hasField(band({ website: 'https://example.com' }), 'website')).toBe(true)
  })

  it('counts a javascript: URL as MISSING, not present', () => {
    expect(hasField(band({ website: 'javascript:alert(1)' }), 'website')).toBe(false)
  })

  it('counts an empty string as missing', () => {
    expect(hasField(band({ website: '' }), 'website')).toBe(false)
  })

  it('counts a bare Instagram handle as present', () => {
    expect(hasField(band({ instagram: '@testband' }), 'instagram')).toBe(true)
  })

  it('counts an Instagram handle containing a colon as missing', () => {
    expect(hasField(band({ instagram: 'javascript:x' }), 'instagram')).toBe(false)
  })

  it('counts an Instagram handle containing whitespace as missing', () => {
    expect(hasField(band({ instagram: 'test band' }), 'instagram')).toBe(false)
  })

  it('counts a bare Bandcamp domain as present via the https fallback', () => {
    expect(hasField(band({ bandcamp: 'testband.bandcamp.com' }), 'bandcamp')).toBe(true)
  })
})

describe('hasField — profile fields', () => {
  it('treats a whitespace-only genre as missing', () => {
    expect(hasField(band({}, { genre: '   ' }), 'genre')).toBe(false)
  })

  it('treats a present genre as present', () => {
    expect(hasField(band({}, { genre: 'punk' }), 'genre')).toBe(true)
  })

  it('treats a null photo_url as missing', () => {
    expect(hasField(band({}, { photo_url: null }), 'photo_url')).toBe(false)
  })

  it('builds origin from city and region', () => {
    expect(hasField(band({}, { origin_city: 'Waterloo', origin_region: 'ON' }), 'origin')).toBe(true)
  })

  it('falls back to the legacy origin string when city and region are null', () => {
    expect(hasField(band({}, { origin_city: null, origin_region: null, origin: 'Kitchener, ON' }), 'origin')).toBe(true)
  })

  it('treats an entirely absent origin as missing', () => {
    expect(hasField(band({}), 'origin')).toBe(false)
  })
})

describe('formatOrigin', () => {
  it('joins city and region', () => {
    expect(formatOrigin({ origin_city: 'Waterloo', origin_region: 'ON' })).toBe('Waterloo, ON')
  })

  it('falls back to the legacy string', () => {
    expect(formatOrigin({ origin: 'Kitchener, ON' })).toBe('Kitchener, ON')
  })

  it('returns an empty string for a missing band', () => {
    expect(formatOrigin(undefined)).toBe('')
  })
})

describe('hasAnyLink / countLinks', () => {
  it('is false when every link is absent', () => {
    expect(hasAnyLink(band({}))).toBe(false)
  })

  it('is false when the only link sanitizes away', () => {
    expect(hasAnyLink(band({ website: 'javascript:alert(1)' }))).toBe(false)
  })

  it('is true when one link resolves', () => {
    expect(hasAnyLink(band({ bandcamp: 'testband.bandcamp.com' }))).toBe(true)
  })

  it('counts only resolvable links', () => {
    expect(countLinks(band({ website: 'https://example.com', spotify: 'javascript:x' }))).toBe(1)
  })
})

describe('matchesGapFilter', () => {
  const withIg = band({ instagram: '@testband' })
  const withoutIg = band({ spotify: 'https://open.spotify.com/artist/abc' })

  it('matches everything when no keys and no preset are set', () => {
    expect(matchesGapFilter(withIg, { mode: 'missing', keys: [], noLinks: false })).toBe(true)
  })

  it('missing mode selects the band lacking the field', () => {
    const filter = { mode: 'missing', keys: ['instagram'], noLinks: false }
    expect(matchesGapFilter(withoutIg, filter)).toBe(true)
    expect(matchesGapFilter(withIg, filter)).toBe(false)
  })

  it('has mode selects the band holding the field', () => {
    const filter = { mode: 'has', keys: ['instagram'], noLinks: false }
    expect(matchesGapFilter(withIg, filter)).toBe(true)
    expect(matchesGapFilter(withoutIg, filter)).toBe(false)
  })

  it('combines multiple keys as ANY, not ALL', () => {
    // Has Spotify but not Instagram -> still matches "missing instagram OR spotify"
    const filter = { mode: 'missing', keys: ['instagram', 'spotify'], noLinks: false }
    expect(matchesGapFilter(withoutIg, filter)).toBe(true)
  })

  it('ANDs the noLinks preset on top of the key predicate', () => {
    const filter = { mode: 'missing', keys: ['instagram'], noLinks: true }
    // Missing Instagram, but HAS Spotify -> excluded by the preset
    expect(matchesGapFilter(withoutIg, filter)).toBe(false)
    expect(matchesGapFilter(band({}), filter)).toBe(true)
  })

  it('tolerates an undefined filter', () => {
    expect(matchesGapFilter(withIg, undefined)).toBe(true)
  })
})

describe('countGaps', () => {
  it('counts how many bands are MISSING each field', () => {
    const counts = countGaps([band({ instagram: '@a' }), band({}), band({})])
    expect(counts.instagram).toBe(2)
    expect(counts[NO_LINKS_KEY]).toBe(2)
  })

  it('returns a zero for every known field even on an empty roster', () => {
    const counts = countGaps([])
    for (const field of GAP_FIELDS) expect(counts[field.key]).toBe(0)
    expect(counts[NO_LINKS_KEY]).toBe(0)
  })
})

describe('isGapFilterActive', () => {
  it('is false for the empty filter', () => {
    expect(isGapFilterActive({ mode: 'missing', keys: [], noLinks: false })).toBe(false)
  })

  it('is true when a key is checked', () => {
    expect(isGapFilterActive({ mode: 'missing', keys: ['spotify'], noLinks: false })).toBe(true)
  })

  it('is true when only the preset is on', () => {
    expect(isGapFilterActive({ mode: 'missing', keys: [], noLinks: true })).toBe(true)
  })
})

describe('registry shape', () => {
  it('keeps the Links-column render order', () => {
    expect(LINK_FIELDS.map(f => f.key)).toEqual([
      'website',
      'instagram',
      'bandcamp',
      'facebook',
      'youtube',
      'spotify',
      'apple_music',
      'linktree',
    ])
  })

  it('gives every link field an icon, a resolver, and literal Tailwind classes', () => {
    for (const field of LINK_FIELDS) {
      expect(typeof field.resolveHref).toBe('function')
      expect(field.Icon).toBeTruthy()
      expect(field.accent).toMatch(/^hover:text-\S+ focus-visible:outline-\S+$/)
      expect(field.accent).not.toContain('${')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/admin/utils/__tests__/bandFields.test.js`
Expected: FAIL — `Failed to resolve import "../bandFields"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/admin/utils/bandFields.js`:

```js
import { Globe } from 'lucide-react'
import { safeExternalHref, safeHttpsFallbackHref, safeInstagramHref } from '../../utils/urlSafety'
import {
  AppleMusicIcon,
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  LinktreeIcon,
  SpotifyIcon,
  YouTubeIcon,
} from '../../components/ui/SocialIcons'

// Shared by every link anchor in the Links column. The per-field colours live
// in `accent` below.
export const LINK_BASE_CLASS =
  'text-white/70 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2'

// The single source of truth for "what is a link field". Consumed by BOTH
// SocialLinksIcons (rendering) and hasField (filtering), so the filter can
// never claim an artist has a link the column doesn't show.
//
// Order is the Links-column render order AND the filter popover's row order.
// The popover deliberately does not sort by gap count: rows that reorder as
// data is entered would move the checkbox out from under the cursor.
//
// `accent` MUST stay a complete literal string. Tailwind v4 scans source text
// for whole class names and never evaluates template expressions, so building
// these as `hover:text-${colour}` would generate no CSS at all and silently
// drop every hover and focus style in the column.
//
// `ariaNoun` is separate from `label` for one reason: "website" is a common
// noun and reads correctly lowercase mid-sentence ("Open website for X"),
// while the other seven are proper nouns. This preserves the existing,
// correct labels rather than regularising them.
export const LINK_FIELDS = [
  {
    key: 'website',
    label: 'Website',
    ariaNoun: 'website',
    resolveHref: safeExternalHref,
    Icon: Globe,
    accent: 'hover:text-accent-400 focus-visible:outline-accent-400',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    ariaNoun: 'Instagram',
    resolveHref: safeInstagramHref,
    Icon: InstagramIcon,
    accent: 'hover:text-pink-400 focus-visible:outline-pink-400',
  },
  {
    key: 'bandcamp',
    label: 'Bandcamp',
    ariaNoun: 'Bandcamp',
    resolveHref: safeHttpsFallbackHref,
    Icon: BandcampIcon,
    accent: 'hover:text-teal-400 focus-visible:outline-teal-400',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    ariaNoun: 'Facebook',
    resolveHref: safeExternalHref,
    Icon: FacebookIcon,
    accent: 'hover:text-blue-400 focus-visible:outline-blue-400',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    ariaNoun: 'YouTube',
    resolveHref: safeExternalHref,
    Icon: YouTubeIcon,
    accent: 'hover:text-red-500 focus-visible:outline-red-500',
  },
  {
    key: 'spotify',
    label: 'Spotify',
    ariaNoun: 'Spotify',
    resolveHref: safeExternalHref,
    Icon: SpotifyIcon,
    accent: 'hover:text-green-400 focus-visible:outline-green-400',
  },
  {
    key: 'apple_music',
    label: 'Apple Music',
    ariaNoun: 'Apple Music',
    resolveHref: safeExternalHref,
    Icon: AppleMusicIcon,
    accent: 'hover:text-rose-400 focus-visible:outline-rose-400',
  },
  {
    key: 'linktree',
    label: 'Linktree',
    ariaNoun: 'Linktree',
    resolveHref: safeExternalHref,
    Icon: LinktreeIcon,
    accent: 'hover:text-lime-400 focus-visible:outline-lime-400',
  },
]

// Non-link profile blanks worth filling. `contact_email` is deliberately
// absent: it is empty on all 218 active profiles, so a filter for it would
// always match everything.
export const PROFILE_FIELDS = [
  { key: 'photo_url', label: 'Photo' },
  { key: 'genre', label: 'Genre' },
  { key: 'origin', label: 'Origin' },
  { key: 'description', label: 'Bio' },
]

export const GAP_FIELDS = [...LINK_FIELDS, ...PROFILE_FIELDS]

// Bucket key for the "no links at all" preset. Not a real field: it means
// "missing ALL eight links", which the ANY-semantics of `keys` cannot express.
export const NO_LINKS_KEY = '__noLinks__'

export const EMPTY_GAP_FILTER = { mode: 'missing', keys: [], noLinks: false }

const LINK_FIELD_BY_KEY = new Map(LINK_FIELDS.map(field => [field.key, field]))

export function parseSocialLinks(band) {
  const raw = band?.social_links
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    // JSON.parse('null') === null and JSON.parse('"x"') === 'x'; neither is a
    // usable link map, so normalise both to {}.
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_e) {
    return {}
  }
}

export function formatOrigin(band) {
  if (!band) return ''
  return [band.origin_city, band.origin_region].filter(Boolean).join(', ') || band.origin || ''
}

// Presence means "renders as a real link", not "non-empty in the DB": a value
// that fails URL sanitisation shows nothing in the Links column, so the filter
// must agree it is missing.
export function hasField(band, key) {
  const linkField = LINK_FIELD_BY_KEY.get(key)
  if (linkField) {
    return linkField.resolveHref(parseSocialLinks(band)[key]) !== '#'
  }
  if (key === 'origin') return formatOrigin(band) !== ''
  return String(band?.[key] ?? '').trim() !== ''
}

export function countLinks(band) {
  const links = parseSocialLinks(band)
  return LINK_FIELDS.filter(field => field.resolveHref(links[field.key]) !== '#').length
}

export function hasAnyLink(band) {
  return countLinks(band) > 0
}

// Returns MISSING counts, which is what the filter popover displays.
export function countGaps(bands) {
  const counts = { [NO_LINKS_KEY]: 0 }
  for (const field of GAP_FIELDS) counts[field.key] = 0

  for (const band of bands) {
    for (const field of GAP_FIELDS) {
      if (!hasField(band, field.key)) counts[field.key] += 1
    }
    if (!hasAnyLink(band)) counts[NO_LINKS_KEY] += 1
  }
  return counts
}

// Checked fields combine as ANY (a union worklist: one pass fills them all),
// with the noLinks preset ANDed on top.
export function matchesGapFilter(band, gapFilter) {
  const { mode = 'missing', keys = [], noLinks = false } = gapFilter || {}
  if (noLinks && hasAnyLink(band)) return false
  if (keys.length === 0) return true
  return keys.some(key => (mode === 'missing' ? !hasField(band, key) : hasField(band, key)))
}

export function isGapFilterActive(gapFilter) {
  const { keys = [], noLinks = false } = gapFilter || {}
  return keys.length > 0 || noLinks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/admin/utils/__tests__/bandFields.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full gate**

Run: `make gate`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/utils/bandFields.js frontend/src/admin/utils/__tests__/bandFields.test.js
git commit -m "feat(admin): add bandFields registry and gap predicates

Single source of truth for every filterable artist field. Presence means
the value resolves to a real href, not that it is non-empty -- a value that
fails URL sanitisation renders nothing in the Links column and must count
as missing.

Per-field Tailwind colours are stored as complete literal strings: v4 scans
source text for whole class names, so interpolating them would generate no
CSS and silently drop every hover and focus style.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Refactor `SocialLinksIcons` onto the registry

The characterization test from Task 1 is the gate. **Do not modify it in this task** — if it goes red, the registry is wrong, not the test.

**Files:**
- Modify: `frontend/src/admin/components/SocialLinksIcons.jsx`

**Interfaces:**
- Consumes: `LINK_FIELDS`, `LINK_BASE_CLASS`, `parseSocialLinks`, `hasAnyLink` from `bandFields.js` (Task 2).
- Produces: unchanged public interface — `default SocialLinksIcons({ band })`.

- [ ] **Step 1: Replace the file body**

```jsx
import PropTypes from 'prop-types'
import { LINK_BASE_CLASS, LINK_FIELDS, hasAnyLink, parseSocialLinks } from '../utils/bandFields'

export { parseSocialLinks }

export default function SocialLinksIcons({ band }) {
  const links = parseSocialLinks(band)

  if (!hasAnyLink(band)) return <span className="text-white/30">-</span>

  return (
    <div className="flex gap-2 flex-wrap">
      {LINK_FIELDS.map(({ key, label, ariaNoun, resolveHref, Icon, accent }) => {
        const href = resolveHref(links[key])
        if (href === '#') return null
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_BASE_CLASS} ${accent}`}
            title={label}
            aria-label={`Open ${ariaNoun} for ${band.name}`}
          >
            <Icon size={14} />
          </a>
        )
      })}
    </div>
  )
}

SocialLinksIcons.propTypes = {
  band: PropTypes.object.isRequired,
}
```

Note `export { parseSocialLinks }` — Task 1's test imports it from this module, and re-exporting keeps that import path valid while the definition now lives in `bandFields.js`.

- [ ] **Step 2: Run the characterization test unchanged**

Run: `cd frontend && npx vitest run src/admin/components/__tests__/SocialLinksIcons.test.jsx`
Expected: PASS — all 7 tests, byte-identical expectations to Task 1.

If the aria-label test fails with `Open Website for Test Band`, the `ariaNoun` for `website` is wrong in the registry — it must be lowercase `'website'`.

- [ ] **Step 3: Verify the hover classes survived**

Tailwind cannot be checked by a unit test. Run the build and grep the emitted CSS for two of the per-field colours:

Run: `npm run build --prefix frontend && grep -ro "hover.\\{0,2\\}text-pink-400" frontend/dist/assets/ | head -3`
Expected: at least one match. Repeat for `lime-400`. If either is missing, an `accent` string was interpolated rather than written literally.

- [ ] **Step 4: Run the full gate**

Run: `make gate`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/components/SocialLinksIcons.jsx
git commit -m "refactor(admin): render Links column from the bandFields registry

Collapses eight near-identical JSX blocks into a map over LINK_FIELDS.
The characterization tests from the previous commit pass unchanged, so
this is provably behaviour-preserving. Adding a ninth platform is now a
one-line registry entry that updates the column and the filter together.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The `DataGapFilter` popover

**Files:**
- Create: `frontend/src/admin/components/DataGapFilter.jsx`
- Create: `frontend/src/admin/components/__tests__/DataGapFilter.test.jsx`

**Interfaces:**
- Consumes: `LINK_FIELDS`, `PROFILE_FIELDS`, `NO_LINKS_KEY`, `EMPTY_GAP_FILTER` from `bandFields.js`.
- Produces: `default DataGapFilter({ value, counts, onChange })` where `value` is `{ mode, keys, noLinks }` and `counts` is `Record<string, number>`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/admin/components/__tests__/DataGapFilter.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DataGapFilter from '../DataGapFilter'
import { EMPTY_GAP_FILTER, NO_LINKS_KEY } from '../../utils/bandFields'

const COUNTS = {
  website: 179,
  instagram: 94,
  bandcamp: 79,
  facebook: 140,
  youtube: 187,
  spotify: 154,
  apple_music: 173,
  linktree: 198,
  photo_url: 196,
  genre: 98,
  origin: 68,
  description: 160,
  [NO_LINKS_KEY]: 49,
}

const setup = (value = EMPTY_GAP_FILTER) => {
  const onChange = vi.fn()
  render(<DataGapFilter value={value} counts={COUNTS} onChange={onChange} />)
  return { onChange }
}

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))

describe('DataGapFilter', () => {
  it('starts closed and opens on click', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /data gaps/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows a missing-count beside every field', () => {
    setup()
    openPanel()
    expect(screen.getByLabelText('Instagram — 94 missing')).toBeInTheDocument()
    expect(screen.getByLabelText('Photo — 196 missing')).toBeInTheDocument()
  })

  it('emits the checked key on toggle', () => {
    const { onChange } = setup()
    openPanel()
    fireEvent.click(screen.getByLabelText('Instagram — 94 missing'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: ['instagram'], noLinks: false })
  })

  it('removes an already-checked key on second toggle', () => {
    const { onChange } = setup({ mode: 'missing', keys: ['instagram'], noLinks: false })
    openPanel()
    fireEvent.click(screen.getByLabelText('Instagram — 94 missing'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: [], noLinks: false })
  })

  it('switches mode without losing the checked keys', () => {
    const { onChange } = setup({ mode: 'missing', keys: ['spotify'], noLinks: false })
    openPanel()
    fireEvent.click(screen.getByLabelText('Has'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'has', keys: ['spotify'], noLinks: false })
  })

  it('toggles the no-links preset', () => {
    const { onChange } = setup()
    openPanel()
    fireEvent.click(screen.getByLabelText('No links at all — 49 artists'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: [], noLinks: true })
  })

  it('clear all resets to the empty filter', () => {
    const { onChange } = setup({ mode: 'has', keys: ['spotify'], noLinks: true })
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenCalledWith(EMPTY_GAP_FILTER)
  })

  it('badges the trigger with the number of active filters', () => {
    setup({ mode: 'missing', keys: ['spotify', 'instagram'], noLinks: true })
    expect(screen.getByRole('button', { name: /data gaps/i })).toHaveTextContent('3')
  })

  it('closes on Escape and returns focus to the trigger', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /data gaps/i })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside click', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /data gaps/i })
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('lists link fields in registry order, not by count', () => {
    setup()
    openPanel()
    const boxes = screen.getAllByRole('checkbox').map(b => b.getAttribute('name'))
    expect(boxes.slice(0, 3)).toEqual(['website', 'instagram', 'bandcamp'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/admin/components/__tests__/DataGapFilter.test.jsx`
Expected: FAIL — `Failed to resolve import "../DataGapFilter"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/admin/components/DataGapFilter.jsx`:

```jsx
import { useEffect, useId, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown } from 'lucide-react'
import { EMPTY_GAP_FILTER, LINK_FIELDS, NO_LINKS_KEY, PROFILE_FIELDS } from '../utils/bandFields'

const CONTROL_CLASS =
  'min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-hidden'

const ROW_CLASS =
  'flex items-center justify-between gap-3 px-3 py-2 min-h-[44px] cursor-pointer hover:bg-white/5 rounded'

function GapCheckbox({ field, counts, checked, onToggle }) {
  const count = counts[field.key] ?? 0
  return (
    <label className={ROW_CLASS}>
      <span className="flex items-center gap-3">
        <input
          type="checkbox"
          name={field.key}
          className="h-5 w-5 cursor-pointer"
          checked={checked}
          onChange={() => onToggle(field.key)}
          aria-label={`${field.label} — ${count} missing`}
        />
        <span className="text-white text-sm">{field.label}</span>
      </span>
      <span className="text-xs text-white/50 tabular-nums">{count}</span>
    </label>
  )
}

GapCheckbox.propTypes = {
  field: PropTypes.shape({ key: PropTypes.string, label: PropTypes.string }).isRequired,
  counts: PropTypes.object.isRequired,
  checked: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
}

export default function DataGapFilter({ value, counts, onChange }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const panelId = useId()

  const activeCount = value.keys.length + (value.noLinks ? 1 : 0)

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = event => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const toggleKey = key => {
    const keys = value.keys.includes(key) ? value.keys.filter(k => k !== key) : [...value.keys, key]
    onChange({ ...value, keys })
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`${CONTROL_CLASS} flex items-center gap-2`}
      >
        <span>Data gaps</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-accent-500 text-bg-navy text-xs font-semibold h-5 min-w-5 px-1">
            {activeCount}
          </span>
        )}
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-accent-500/30 bg-bg-purple p-2 shadow-xl max-h-[70vh] overflow-y-auto"
        >
          <fieldset className="flex gap-4 px-3 py-2">
            <legend className="sr-only">Match artists that are</legend>
            {['missing', 'has'].map(mode => (
              <label key={mode} className="flex items-center gap-2 text-sm text-white cursor-pointer">
                <input
                  type="radio"
                  name="gap-mode"
                  className="h-4 w-4 cursor-pointer"
                  checked={value.mode === mode}
                  onChange={() => onChange({ ...value, mode })}
                  aria-label={mode === 'missing' ? 'Missing' : 'Has'}
                />
                <span>{mode === 'missing' ? 'Missing' : 'Has'}</span>
              </label>
            ))}
          </fieldset>

          <p className="px-3 pb-2 text-xs text-white/50">
            Matches artists {value.mode === 'missing' ? 'missing' : 'with'} <strong>any</strong> of the checked fields.
          </p>

          <div className="border-t border-white/10 pt-1">
            {LINK_FIELDS.map(field => (
              <GapCheckbox
                key={field.key}
                field={field}
                counts={counts}
                checked={value.keys.includes(field.key)}
                onToggle={toggleKey}
              />
            ))}
          </div>

          <div className="border-t border-white/10 pt-1">
            {PROFILE_FIELDS.map(field => (
              <GapCheckbox
                key={field.key}
                field={field}
                counts={counts}
                checked={value.keys.includes(field.key)}
                onToggle={toggleKey}
              />
            ))}
          </div>

          <div className="border-t border-white/10 pt-1">
            <label className={ROW_CLASS}>
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name={NO_LINKS_KEY}
                  className="h-5 w-5 cursor-pointer"
                  checked={value.noLinks}
                  onChange={() => onChange({ ...value, noLinks: !value.noLinks })}
                  aria-label={`No links at all — ${counts[NO_LINKS_KEY] ?? 0} artists`}
                />
                <span className="text-white text-sm">No links at all</span>
              </span>
              <span className="text-xs text-white/50 tabular-nums">{counts[NO_LINKS_KEY] ?? 0}</span>
            </label>
            <button
              type="button"
              onClick={() => onChange(EMPTY_GAP_FILTER)}
              className="w-full text-left px-3 py-2 min-h-[44px] text-sm text-accent-400 hover:bg-white/5 rounded"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

DataGapFilter.propTypes = {
  value: PropTypes.shape({
    mode: PropTypes.oneOf(['missing', 'has']).isRequired,
    keys: PropTypes.arrayOf(PropTypes.string).isRequired,
    noLinks: PropTypes.bool.isRequired,
  }).isRequired,
  counts: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/admin/components/__tests__/DataGapFilter.test.jsx`
Expected: PASS — all 11 tests.

- [ ] **Step 5: Run the full gate**

Run: `make gate`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/components/DataGapFilter.jsx \
        frontend/src/admin/components/__tests__/DataGapFilter.test.jsx
git commit -m "feat(admin): add DataGapFilter popover

Controlled filter panel listing every gap field with a live missing-count,
so the control doubles as the gap report. Rows render in registry order
rather than by count -- a list that reorders as data is entered would move
the checkbox out from under the cursor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the filter into `RosterTab`

**Files:**
- Modify: `frontend/src/admin/RosterTab.jsx`
- Modify: `frontend/src/admin/__tests__/RosterTab.test.jsx`

**Interfaces:**
- Consumes: `DataGapFilter` (Task 4); `EMPTY_GAP_FILTER`, `GAP_FIELDS`, `NO_LINKS_KEY`, `countGaps`, `formatOrigin`, `isGapFilterActive`, `matchesGapFilter` (Task 2).

- [ ] **Step 1: Add imports and state**

In `RosterTab.jsx`, add to the imports:

```jsx
import DataGapFilter from './components/DataGapFilter'
import {
  EMPTY_GAP_FILTER,
  GAP_FIELDS,
  NO_LINKS_KEY,
  countGaps,
  formatOrigin,
  isGapFilterActive,
  matchesGapFilter,
} from './utils/bandFields'
```

Delete the local `formatOrigin` definition (currently `RosterTab.jsx:270-273`) — it now comes from `bandFields.js` so the Origin column and the origin gap predicate share one implementation.

Add beside the existing `statusFilter` state:

```jsx
const [gapFilter, setGapFilter] = useState(EMPTY_GAP_FILTER)
```

- [ ] **Step 2: Split the filter memo in two**

Replace the existing `filteredBands` `useMemo` (currently `RosterTab.jsx:275-289`) with:

```jsx
// Split in two on purpose. The popover's counts are computed from
// `searchAndStatusFiltered`, i.e. everything EXCEPT the gap filter itself --
// otherwise checking "Instagram" would collapse every other count to reflect
// that selection and the panel would stop being a gap dashboard the moment
// you used it.
const searchAndStatusFiltered = useMemo(() => {
  const query = searchTerm.trim().toLowerCase()
  return bands.filter(band => {
    if (statusFilter === 'active' && isInactive(band)) return false
    if (statusFilter === 'inactive' && !isInactive(band)) return false
    if (!query) return true
    const originText = formatOrigin(band)
    return (
      band.name?.toLowerCase().includes(query) ||
      originText.toLowerCase().includes(query) ||
      band.genre?.toLowerCase().includes(query) ||
      band.contact_email?.toLowerCase().includes(query)
    )
  })
}, [bands, searchTerm, statusFilter])

const gapCounts = useMemo(() => countGaps(searchAndStatusFiltered), [searchAndStatusFiltered])

const filteredBands = useMemo(
  () => searchAndStatusFiltered.filter(band => matchesGapFilter(band, gapFilter)),
  [searchAndStatusFiltered, gapFilter],
)
```

`sortedBands`, `handleSelectAll`, and the empty state already derive from `filteredBands` and need no change.

- [ ] **Step 3: Render the popover in the header controls**

In the header controls row, immediately after the status `<select>` (currently ends `RosterTab.jsx:602`) and before the `+ New Artist` button, add:

```jsx
<DataGapFilter value={gapFilter} counts={gapCounts} onChange={setGapFilter} />
```

- [ ] **Step 4: Render the active-filter chips**

Add a helper above the `return`:

```jsx
const gapChips = [
  ...gapFilter.keys.map(key => ({
    key,
    label: `${gapFilter.mode === 'missing' ? 'Missing' : 'Has'}: ${
      GAP_FIELDS.find(field => field.key === key)?.label ?? key
    }`,
    remove: () => setGapFilter(prev => ({ ...prev, keys: prev.keys.filter(k => k !== key) })),
  })),
  ...(gapFilter.noLinks
    ? [
        {
          key: NO_LINKS_KEY,
          label: 'No links at all',
          remove: () => setGapFilter(prev => ({ ...prev, noLinks: false })),
        },
      ]
    : []),
]
```

Insert this block directly above the `{/* Bulk Actions */}` comment:

```jsx
{isGapFilterActive(gapFilter) && (
  <div className="flex flex-wrap items-center gap-2">
    {gapChips.map(chip => (
      <button
        key={chip.key}
        type="button"
        onClick={chip.remove}
        className="inline-flex items-center gap-2 rounded-full bg-accent-500/15 px-3 py-1 text-sm text-accent-300 hover:bg-accent-500/25"
        aria-label={`Remove filter: ${chip.label}`}
      >
        <span>{chip.label}</span>
        <span aria-hidden="true">×</span>
      </button>
    ))}
    <span className="text-sm text-white/50">
      {filteredBands.length} {filteredBands.length === 1 ? 'artist' : 'artists'}
    </span>
  </div>
)}
```

- [ ] **Step 5: Add the integration tests**

Append to `frontend/src/admin/__tests__/RosterTab.test.jsx`. Note the existing file's comment about every text query matching twice (desktop table + mobile cards) — these tests honour that with `queryAllByText`:

```jsx
const BAND_WITH_IG = {
  id: 'profile_2',
  band_profile_id: 2,
  name: 'Instagrammed Iguanas',
  genre: 'rock',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: JSON.stringify({ instagram: '@iguanas' }),
}

describe('RosterTab — data-gap filtering', () => {
  it('filters to artists missing Instagram and restores on chip removal', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))
    fireEvent.click(screen.getByLabelText('Instagram — 1 missing'))

    // ACTIVE_BAND has social_links '{}' -> missing Instagram -> kept.
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Instagrammed Iguanas')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Missing: Instagram' }))
    expect(screen.getAllByText('Instagrammed Iguanas').length).toBeGreaterThan(0)
  })

  it('counts stay stable after a gap filter is applied', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))
    fireEvent.click(screen.getByLabelText('Instagram — 1 missing'))

    // Spotify's count is still measured against the search/status-filtered
    // roster (both bands), not the Instagram-filtered subset.
    expect(screen.getByLabelText('Spotify — 2 missing')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the roster tests**

Run: `cd frontend && npx vitest run src/admin/__tests__/RosterTab.test.jsx`
Expected: PASS — the 3 existing tests plus the 2 new ones.

- [ ] **Step 7: Run the full gate**

Run: `make gate`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/admin/RosterTab.jsx frontend/src/admin/__tests__/RosterTab.test.jsx
git commit -m "feat(admin): filter the roster by data gaps

Adds a Data gaps popover and removable filter chips to the Roster tab, so
'who is missing Instagram?' is one click instead of a SQL query.

The filter memo is split so popover counts are computed upstream of the gap
filter itself -- otherwise checking one field would collapse every other
count and the panel would stop being a gap report once used.

Refs #709

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Sort the Links column by link count (optional — cut freely)

Spec §4 item 6. Skip this task entirely if scope needs trimming; nothing else depends on it.

**Files:**
- Modify: `frontend/src/admin/RosterTab.jsx`
- Modify: `frontend/src/admin/__tests__/RosterTab.test.jsx`

**Interfaces:**
- Consumes: `countLinks` from `bandFields.js` (Task 2).

- [ ] **Step 1: Add `countLinks` to the existing bandFields import, then extend the comparator**

In the `sortedBands` `useMemo`, add a branch alongside the existing `follower_count` branch:

```jsx
if (sortConfig.key === 'link_count') {
  const aVal = countLinks(a)
  const bVal = countLinks(b)
  return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
}
```

- [ ] **Step 2: Make the Links header clickable**

Replace the static Links `<th>` (currently `RosterTab.jsx:708`):

```jsx
<th
  onClick={() => handleSort('link_count')}
  className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
>
  Links <SortIcon col="link_count" sortConfig={sortConfig} />
</th>
```

- [ ] **Step 3: Add a test**

Append inside the data-gap `describe` in `frontend/src/admin/__tests__/RosterTab.test.jsx`:

```jsx
it('sorts by link count, sparsest first', async () => {
  bandsApi.getAll.mockResolvedValue({ bands: [BAND_WITH_IG, ACTIVE_BAND] })
  render(<RosterTab showToast={vi.fn()} />)
  await screen.findAllByText('Active Aardvarks')

  fireEvent.click(screen.getByText(/^Links/))

  // ACTIVE_BAND has zero links, BAND_WITH_IG has one -> ascending puts the
  // empty profile first. Row 0 is the header row.
  const rows = screen.getAllByRole('row').slice(1)
  expect(rows[0]).toHaveTextContent('Active Aardvarks')
})
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/admin/__tests__/RosterTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `make gate`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/RosterTab.jsx frontend/src/admin/__tests__/RosterTab.test.jsx
git commit -m "feat(admin): sort the roster by link count

Click the Links header to surface the sparsest profiles first.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Review gates, follow-up issue, PR

**Files:** none modified by default.

- [ ] **Step 1: Rebase on main**

```bash
git fetch origin && git rebase origin/main
```

- [ ] **Step 2: Run the full gate one more time post-rebase**

Run: `make gate`
Expected: exit 0.

- [ ] **Step 3: Confirm coverage did not regress**

Run: `cd frontend && npx vitest run --coverage`
Expected: statements ≥ 57, branches ≥ 50, functions ≥ 60, lines ≥ 58. Coverage should *rise* — the `SocialLinksIcons` characterization test invokes the eight `SocialIcons` components for the first time, and they were already in the denominator via `RosterTab.test.jsx`.

- [ ] **Step 4: Run the AI review gate**

Run: `make review`
Expected: findings addressed before the PR opens, not after.

- [ ] **Step 5: File the deferred event-filter issue**

```bash
gh issue create \
  --title "feat(admin): filter the roster by event (e.g. only Vol. 17 performers)" \
  --label "enhancement,priority:p3" \
  --body "Deferred from the roster data-gap filter work.

The roster branch of \`GET /api/admin/bands\` keeps only each profile's MOST
RECENT performance (\`MAX(e.date)\` plus bare columns, \`functions/api/admin/bands.js:227\`),
so a band playing both Vol. 17 and Buddies Fest 2 carries only the latter.
There is no client-side way to ask 'Vol. 17 artists missing Instagram'.

Needs the roster query to aggregate all event ids per profile — note this is
the query with the #618 LIMIT-truncation history, so any change needs a test
that a profile with many performances still returns exactly one row.

Spec: \`docs/superpowers/specs/2026-07-31-roster-data-gap-filter-design.md\` (Out of scope table)."
```

- [ ] **Step 6: Open the PR**

Use `.github/pull_request_template.md`, fill every section, tick the verification checkboxes, and apply one type + one priority label:

```bash
gh pr create --label "enhancement,priority:p2"
```

Body must include `Refs #709` on its own line. Attribution line: `Built by Sonny · Reviewed by Theo · 🤖 [Claude Code](https://claude.ai/claude-code)`

---

## Self-Review

**Spec coverage:** §1 registry → Task 2. §1 `SocialLinksIcons` refactor → Tasks 1 + 3. §2 semantics → Task 2 (`matchesGapFilter`). §3 popover, counts rule, a11y, theming → Task 4. §4 items 1–5 → Task 5; item 6 (optional) → Task 6. Testing section → Tasks 1, 2, 4, 5. Out-of-scope event filter → Task 7 Step 5. No gaps.

**Placeholder scan:** No TBD/TODO. Every code step carries real code. Every test step names an exact command and expected result.

**Type consistency:** `matchesGapFilter(band, gapFilter)`, `countGaps(bands)`, `hasField(band, key)`, `countLinks(band)`, `isGapFilterActive(gapFilter)`, `formatOrigin(band)` are used in Tasks 3–6 exactly as defined in Task 2. The filter object is `{ mode, keys, noLinks }` throughout. `NO_LINKS_KEY` is used as a counts bucket (Task 2) and a checkbox `name` (Task 4), never as a member of `keys`.
