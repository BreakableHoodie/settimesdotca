import { describe, expect, it } from 'vitest'
import {
  BLANK,
  FILTERABLE_COLUMNS,
  activeFilterCount,
  isColumnFiltered,
  isInactive,
  linkCountsFor,
  matchesColumnFilters,
  valueCountsFor,
} from '../rosterColumns'

function getValuesFor(columnKey, band) {
  const column = FILTERABLE_COLUMNS.find(c => c.key === columnKey)
  return column.getValues(band)
}

const band = (overrides = {}) => ({
  name: 'Test Band',
  genre: 'punk',
  is_active: 1,
  origin_city: '',
  origin_region: '',
  origin: '',
  contact_email: '',
  follower_count: 0,
  social_links: '{}',
  ...overrides,
})

describe('isInactive', () => {
  it('treats is_active: 0 as inactive', () => {
    expect(isInactive(band({ is_active: 0 }))).toBe(true)
  })

  it('treats is_active: 1 as active', () => {
    expect(isInactive(band({ is_active: 1 }))).toBe(false)
  })

  it('treats the legacy boolean false as inactive (#619)', () => {
    expect(isInactive(band({ is_active: false }))).toBe(true)
  })
})

describe('getValues — name column', () => {
  it('returns the trimmed name as a single-element array', () => {
    expect(getValuesFor('name', band({ name: 'The Anti-Queens' }))).toEqual(['The Anti-Queens'])
  })

  it('treats a whitespace-only name as blank', () => {
    expect(getValuesFor('name', band({ name: '   ' }))).toEqual([BLANK])
  })
})

describe('getValues — origin column', () => {
  it('uses formatOrigin for city+region', () => {
    expect(getValuesFor('origin', band({ origin_city: 'Waterloo', origin_region: 'ON' }))).toEqual(['Waterloo, ON'])
  })

  it('falls back to the legacy origin string when city/region are absent', () => {
    expect(getValuesFor('origin', band({ origin_city: '', origin_region: '', origin: 'Kitchener, ON' }))).toEqual([
      'Kitchener, ON',
    ])
  })

  it('treats a fully blank origin as blank', () => {
    expect(getValuesFor('origin', band({ origin_city: '', origin_region: '', origin: '' }))).toEqual([BLANK])
  })
})

describe('getValues — genre column (multi-valued)', () => {
  it('treats a null genre as blank', () => {
    expect(getValuesFor('genre', band({ genre: null }))).toEqual([BLANK])
  })

  it('splits "punk, indie rock" into two tokens', () => {
    expect(getValuesFor('genre', band({ genre: 'punk, indie rock' }))).toEqual(['punk', 'indie rock'])
  })

  it('drops empty tokens from "punk,,  indie"', () => {
    expect(getValuesFor('genre', band({ genre: 'punk,,  indie' }))).toEqual(['punk', 'indie'])
  })
})

describe('getValues — is_active (Status) column', () => {
  it('reports Inactive for is_active: 0', () => {
    expect(getValuesFor('is_active', band({ is_active: 0 }))).toEqual(['Inactive'])
  })

  it('reports Active for is_active: 1', () => {
    expect(getValuesFor('is_active', band({ is_active: 1 }))).toEqual(['Active'])
  })

  it('reports Inactive for the legacy boolean false', () => {
    expect(getValuesFor('is_active', band({ is_active: false }))).toEqual(['Inactive'])
  })
})

describe('getValues — contact_email column', () => {
  it('treats an empty contact_email as blank', () => {
    expect(getValuesFor('contact_email', band({ contact_email: '' }))).toEqual([BLANK])
  })

  it('returns a present contact_email as-is', () => {
    expect(getValuesFor('contact_email', band({ contact_email: 'a@example.com' }))).toEqual(['a@example.com'])
  })
})

describe('getValues — follower_count column', () => {
  it('stringifies 0', () => {
    expect(getValuesFor('follower_count', band({ follower_count: 0 }))).toEqual(['0'])
  })

  it('stringifies 1', () => {
    expect(getValuesFor('follower_count', band({ follower_count: 1 }))).toEqual(['1'])
  })

  it('defaults undefined to "0"', () => {
    expect(getValuesFor('follower_count', band({ follower_count: undefined }))).toEqual(['0'])
  })

  // D1 returns NULL, not undefined, for an unset INTEGER column -- the `??`
  // in getValues handles both, but only `undefined` had coverage above.
  it('defaults null (as D1 returns for an unset column) to "0"', () => {
    expect(getValuesFor('follower_count', band({ follower_count: null }))).toEqual(['0'])
  })
})

describe('matchesColumnFilters', () => {
  it('matches everything when there are no filters', () => {
    expect(matchesColumnFilters(band(), undefined)).toBe(true)
    expect(matchesColumnFilters(band(), {})).toBe(true)
  })

  it('narrows to a single matching value', () => {
    const b = band({ name: 'Alpha' })
    expect(matchesColumnFilters(b, { name: { values: ['Alpha'] } })).toBe(true)
    expect(matchesColumnFilters(b, { name: { values: ['Beta'] } })).toBe(false)
  })

  it('ANDs across two different columns', () => {
    const b = band({ name: 'Alpha', is_active: 1 })
    expect(
      matchesColumnFilters(b, {
        name: { values: ['Alpha'] },
        is_active: { values: ['Active'] },
      })
    ).toBe(true)
    expect(
      matchesColumnFilters(b, {
        name: { values: ['Alpha'] },
        is_active: { values: ['Inactive'] },
      })
    ).toBe(false)
  })

  it('ORs across two values checked within the same column', () => {
    const b = band({ name: 'Alpha' })
    expect(matchesColumnFilters(b, { name: { values: ['Alpha', 'Beta'] } })).toBe(true)
    expect(matchesColumnFilters(band({ name: 'Beta' }), { name: { values: ['Alpha', 'Beta'] } })).toBe(true)
    expect(matchesColumnFilters(band({ name: 'Gamma' }), { name: { values: ['Alpha', 'Beta'] } })).toBe(false)
  })

  it('matches a multi-token genre if ANY checked token matches', () => {
    const b = band({ genre: 'punk, indie rock' })
    expect(matchesColumnFilters(b, { genre: { values: ['indie rock'] } })).toBe(true)
    expect(matchesColumnFilters(b, { genre: { values: ['metal'] } })).toBe(false)
  })

  it('treats an empty values array as no filter, not "match nothing"', () => {
    const b = band({ name: 'Alpha' })
    expect(matchesColumnFilters(b, { name: { values: [] } })).toBe(true)
  })

  it('delegates the link_count column to matchesGapFilter', () => {
    const withInstagram = band({ social_links: JSON.stringify({ instagram: '@testband' }) })
    const withoutInstagram = band({ social_links: JSON.stringify({}) })
    const filter = { link_count: { mode: 'missing', keys: ['instagram'], noLinks: false } }
    expect(matchesColumnFilters(withInstagram, filter)).toBe(false)
    expect(matchesColumnFilters(withoutInstagram, filter)).toBe(true)
  })
})

describe('valueCountsFor', () => {
  // Fixture set used across the exclusion tests below:
  // Alpha  — Active,   genre "punk"
  // Beta   — Active,   genre "punk, indie rock"
  // Gamma  — Inactive, genre "indie rock"
  // Delta  — Inactive, genre null (blank)
  const bands = [
    band({ name: 'Alpha', is_active: 1, genre: 'punk' }),
    band({ name: 'Beta', is_active: 1, genre: 'punk, indie rock' }),
    band({ name: 'Gamma', is_active: 0, genre: 'indie rock' }),
    band({ name: 'Delta', is_active: 0, genre: null }),
  ]

  it('counts a multi-token genre once per token', () => {
    const counts = valueCountsFor('genre', bands, {})
    expect(counts.get('punk')).toBe(2) // Alpha, Beta
    expect(counts.get('indie rock')).toBe(2) // Beta, Gamma
    expect(counts.get(BLANK)).toBe(1) // Delta
  })

  it('HONOURS other columns: filtering Status to Active narrows the Genre counts', () => {
    const counts = valueCountsFor('genre', bands, { is_active: { values: ['Active'] } })
    expect(counts.get('punk')).toBe(2) // Alpha, Beta — both active
    expect(counts.get('indie rock')).toBe(1) // Beta only — Gamma is inactive and excluded
    expect(counts.has(BLANK)).toBe(false) // Delta is inactive and excluded entirely
  })

  it("EXCLUDES its own column's filter: filtering Genre to punk does NOT shrink the Genre list", () => {
    const unfiltered = valueCountsFor('genre', bands, {})
    const selfFiltered = valueCountsFor('genre', bands, { genre: { values: ['punk'] } })
    expect(selfFiltered.get('punk')).toBe(unfiltered.get('punk'))
    expect(selfFiltered.get('indie rock')).toBe(unfiltered.get('indie rock'))
    expect(selfFiltered.get(BLANK)).toBe(unfiltered.get(BLANK))
  })

  it('returns an empty Map for an unknown column key', () => {
    expect(valueCountsFor('nope', [], {}).size).toBe(0)
  })

  it('returns an empty Map for the links column (not a values column)', () => {
    expect(valueCountsFor('link_count', bands, {}).size).toBe(0)
  })

  it('guards against non-array bands input', () => {
    expect(valueCountsFor('genre', undefined, {}).size).toBe(0)
  })
})

describe('linkCountsFor', () => {
  it("excludes the link_count column's own filter but honours other columns", () => {
    const withInstagram = band({ name: 'Alpha', social_links: JSON.stringify({ instagram: '@a' }) })
    const withoutInstagram = band({ name: 'Beta', social_links: JSON.stringify({}) })
    const bands = [withInstagram, withoutInstagram]

    // Filtering link_count itself must not change the missing-instagram count.
    const selfFiltered = linkCountsFor(bands, {
      link_count: { mode: 'missing', keys: ['instagram'], noLinks: false },
    })
    expect(selfFiltered.instagram).toBe(1)

    // Filtering a different column (name) does narrow the result.
    const nameFiltered = linkCountsFor(bands, { name: { values: ['Beta'] } })
    expect(nameFiltered.instagram).toBe(1)
    const nameFilteredOther = linkCountsFor(bands, { name: { values: ['Alpha'] } })
    expect(nameFilteredOther.instagram).toBe(0)
  })

  it('guards against non-array bands input', () => {
    expect(linkCountsFor(undefined, {}).instagram).toBe(0)
  })
})

describe('isColumnFiltered', () => {
  it('is false when there is no filter for the column', () => {
    expect(isColumnFiltered({}, 'name')).toBe(false)
    expect(isColumnFiltered(undefined, 'name')).toBe(false)
  })

  it('is true for a values filter with at least one selected value', () => {
    expect(isColumnFiltered({ name: { values: ['Alpha'] } }, 'name')).toBe(true)
  })

  it('is false for a values filter with an empty values array', () => {
    expect(isColumnFiltered({ name: { values: [] } }, 'name')).toBe(false)
  })

  it('is true for link_count when keys are selected', () => {
    expect(isColumnFiltered({ link_count: { keys: ['instagram'], noLinks: false } }, 'link_count')).toBe(true)
  })

  it('is true for link_count when only noLinks is set (no keys)', () => {
    expect(isColumnFiltered({ link_count: { keys: [], noLinks: true } }, 'link_count')).toBe(true)
  })

  it('is false for link_count when keys is empty and noLinks is false', () => {
    expect(isColumnFiltered({ link_count: { keys: [], noLinks: false } }, 'link_count')).toBe(false)
  })
})

describe('activeFilterCount', () => {
  it('is 0 when nothing is filtered', () => {
    expect(activeFilterCount({})).toBe(0)
    expect(activeFilterCount(undefined)).toBe(0)
  })

  it('counts each filtered column once', () => {
    expect(
      activeFilterCount({
        name: { values: ['Alpha'] },
        is_active: { values: ['Active'] },
        genre: { values: [] }, // not active — empty values
      })
    ).toBe(2)
  })

  it('counts the link_count column via its noLinks-only shape', () => {
    expect(activeFilterCount({ link_count: { keys: [], noLinks: true } })).toBe(1)
  })
})

describe('matchesColumnFilters — guards', () => {
  it('handles an undefined columnFilters argument', () => {
    expect(matchesColumnFilters(band(), undefined)).toBe(true)
  })

  // A `values` filter calls column.getValues(band), e.g. `single(band.name)`,
  // which dereferences the band directly -- a null/undefined row would throw
  // there instead of just failing to match. Bands should never actually be
  // null/undefined in the roster array, but the guard keeps a stray hole from
  // crashing the whole filter pass instead of just excluding that one row.
  it('excludes (rather than throws on) a null/undefined band when a values filter is active', () => {
    const filter = { name: { values: ['Alpha'] } }
    expect(() => matchesColumnFilters(null, filter)).not.toThrow()
    expect(matchesColumnFilters(null, filter)).toBe(false)
    expect(matchesColumnFilters(undefined, filter)).toBe(false)
  })
})
