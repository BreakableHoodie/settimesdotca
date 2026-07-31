import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

  it('treats a whitespace-only city/region as absent, consistent with the genre/description trim', () => {
    expect(formatOrigin({ origin_city: '   ', origin_region: null })).toBe('')
    expect(formatOrigin({ origin_city: '   ', origin_region: null, origin: '  Kitchener, ON  ' })).toBe('Kitchener, ON')
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

  it('the "no links at all" preset alone (no keys checked) matches a bandless band and rejects one with a link', () => {
    // This is the headline preset -- the single most-used filter in the
    // feature -- exercised with an EMPTY keys array, which is the shape the
    // UI actually sends when only the "No links at all" checkbox is on. Every
    // other noLinks test in this file also sets `keys: ['instagram']`, which
    // means the `keys.length === 0` early return was never reached with
    // noLinks true. Hoisting the early return above the noLinks guard would
    // make this preset silently match the entire roster with every other
    // test in the file still green.
    const filter = { mode: 'missing', keys: [], noLinks: true }
    expect(matchesGapFilter(band({}), filter)).toBe(true)
    expect(matchesGapFilter(band({ instagram: '@testband' }), filter)).toBe(false)
  })

  it('tolerates an undefined filter', () => {
    expect(matchesGapFilter(withIg, undefined)).toBe(true)
  })

  it('tolerates a non-array keys value instead of throwing', () => {
    // Destructuring defaults only fire on `undefined`; `keys: null` (or any
    // other non-array) must degrade to "no keys selected" rather than throw
    // on `.length`/`.some`.
    expect(matchesGapFilter(withIg, { mode: 'missing', keys: null, noLinks: false })).toBe(true)
    expect(matchesGapFilter(withIg, { mode: 'missing', keys: 'instagram', noLinks: false })).toBe(true)
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

  it('tolerates a non-array argument instead of throwing on for...of', () => {
    const counts = countGaps(undefined)
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

  it('tolerates a non-array keys value instead of throwing', () => {
    expect(isGapFilterActive({ mode: 'missing', keys: null, noLinks: false })).toBe(false)
    expect(isGapFilterActive({ mode: 'missing', keys: null, noLinks: true })).toBe(true)
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
    }
  })

  it('never builds an `accent` class via template-literal interpolation', () => {
    // A runtime check on `field.accent` (e.g. `not.toContain('${')`) cannot
    // catch this: template literals are evaluated at module load, long
    // before the test observes the resulting string, so
    // `` `hover:text-${colour}-400 focus-visible:outline-${colour}-400` ``
    // would still pass a value-level assertion while generating zero CSS —
    // Tailwind v4 scans source TEXT for complete class names and never
    // evaluates template expressions. The only way to enforce this is to
    // scan the source file itself for the interpolation syntax.
    // Resolved via node:path rather than `new URL(relative, import.meta.url)`:
    // jsdom's test environment overrides the global `URL` with its own WHATWG
    // implementation, which `readFileSync`/`fileURLToPath` reject.
    const currentFile = fileURLToPath(import.meta.url)
    const bandFieldsPath = path.join(path.dirname(currentFile), '../bandFields.js')
    const source = readFileSync(bandFieldsPath, 'utf8')

    expect(source).not.toContain('`hover:text-${')
    expect(source).not.toContain('`focus-visible:outline-${')
  })
})
