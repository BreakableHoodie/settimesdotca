import { describe, expect, it } from 'vitest'
import {
  buildConflictsByBandId,
  buildDayNumberMap,
  deriveGenreSuggestions,
  deriveOriginSuggestions,
  filterRosterBands,
  getActiveBands,
  mergeConflicts,
  selectAllBandIds,
  sortRosterBands,
  updateSelectedIds,
} from '../lineupRoster'

const band = (id, over = {}) => ({
  id,
  name: `Band ${id}`,
  venue_id: 1,
  start_time: '20:00',
  end_time: '21:00',
  performance_date: null,
  ...over,
})

// Mirrors LineupTab's own fallback: a NULL performance_date belongs to the
// event's start date (#540).
const festivalDate = eventDate => b => b.performance_date || eventDate
const venueNames = { 1: 'Blue Room', 2: 'Room 47', 3: 'Roost' }
const getVenueName = id => venueNames[id] ?? ''

describe('filterRosterBands', () => {
  const bands = [
    band(1, { name: 'The Anti-Queens', venue_id: 1, performance_date: '2026-10-11' }),
    band(2, { name: 'Sam Nabi', venue_id: 2, performance_date: '2026-10-12' }),
    band(3, { name: 'Deer Fang', venue_id: 1, performance_date: '2026-10-12' }),
  ]

  it('returns everything when no filter is set', () => {
    expect(filterRosterBands(bands, { searchTerm: '', venueFilter: 'all', dayFilter: 'all' })).toHaveLength(3)
  })

  it('matches search case-insensitively on a substring', () => {
    const result = filterRosterBands(bands, { searchTerm: 'anti' })
    expect(result.map(b => b.id)).toEqual([1])
  })

  it('ignores whitespace-only search', () => {
    expect(filterRosterBands(bands, { searchTerm: '   ' })).toHaveLength(3)
  })

  it('filters by venue, comparing as strings so a numeric id still matches', () => {
    expect(filterRosterBands(bands, { venueFilter: '1' }).map(b => b.id)).toEqual([1, 3])
    expect(filterRosterBands(bands, { venueFilter: 1 }).map(b => b.id)).toEqual([1, 3])
  })

  it('filters by festival day on a multi-day event', () => {
    const result = filterRosterBands(bands, {
      isMultiDay: true,
      dayFilter: '2026-10-12',
      bandFestivalDate: festivalDate('2026-10-11'),
    })
    expect(result.map(b => b.id)).toEqual([2, 3])
  })

  it('matches a NULL performance_date against day 1 via the fallback', () => {
    // On a multi-day event a set with no explicit date belongs to the event's
    // start day, so filtering to day 1 must INCLUDE it. Without this, the pair
    // of day tests only proves the filter excludes things.
    const result = filterRosterBands([band(1), band(2, { performance_date: '2026-10-12' })], {
      isMultiDay: true,
      dayFilter: '2026-10-11',
      bandFestivalDate: festivalDate('2026-10-11'),
    })
    expect(result.map(b => b.id)).toEqual([1])
  })

  it('IGNORES dayFilter on a single-day event, where performance_date is NULL', () => {
    // Applying it would drop every set — single-day events never render the
    // selector and leave performance_date NULL (#540).
    const singleDay = [band(1), band(2)]
    const result = filterRosterBands(singleDay, {
      isMultiDay: false,
      dayFilter: '2026-10-12',
      bandFestivalDate: festivalDate('2026-10-11'),
    })
    expect(result).toHaveLength(2)
  })

  it('composes filters', () => {
    const result = filterRosterBands(bands, {
      searchTerm: 'a',
      venueFilter: '1',
      isMultiDay: true,
      dayFilter: '2026-10-12',
      bandFestivalDate: festivalDate('2026-10-11'),
    })
    expect(result.map(b => b.id)).toEqual([3])
  })

  it('does not mutate the input', () => {
    const input = [...bands]
    filterRosterBands(input, { searchTerm: 'anti' })
    expect(input).toHaveLength(3)
  })
})

describe('sortRosterBands', () => {
  const deps = { getVenueName, bandFestivalDate: festivalDate('2026-10-11') }

  it('falls back to start-time order when no key is set, honouring after-midnight', () => {
    // 01:00 is an after-midnight set belonging to the END of the evening, so it
    // must sort after 23:00 rather than first. This is the recurring bug class.
    const bands = [band(1, { start_time: '01:00' }), band(2, { start_time: '23:00' }), band(3, { start_time: '20:00' })]
    expect(sortRosterBands(bands, { key: null }, deps).map(b => b.id)).toEqual([3, 2, 1])
  })

  it('honours after-midnight ordering for the explicit start-time key', () => {
    const bands = [band(1, { start_time: '01:00' }), band(2, { start_time: '23:00' })]
    expect(sortRosterBands(bands, { key: 'start_time', direction: 'asc' }, deps).map(b => b.id)).toEqual([2, 1])
  })

  it('sorts by name with articles stripped (#587)', () => {
    const bands = [band(1, { name: 'Zebra' }), band(2, { name: 'The Anti-Queens' })]
    expect(sortRosterBands(bands, { key: 'name', direction: 'asc' }, deps).map(b => b.name)).toEqual([
      'The Anti-Queens',
      'Zebra',
    ])
  })

  it('reverses on desc', () => {
    const bands = [band(1, { name: 'Zebra' }), band(2, { name: 'Anchor' })]
    expect(sortRosterBands(bands, { key: 'name', direction: 'desc' }, deps).map(b => b.name)).toEqual([
      'Zebra',
      'Anchor',
    ])
  })

  it('sorts by venue name, not venue id', () => {
    // id order is 1,2,3 but name order is Blue Room, Room 47, Roost — a test
    // using ids would pass against an implementation that never resolved names.
    const bands = [band(1, { venue_id: 3 }), band(2, { venue_id: 1 }), band(3, { venue_id: 2 })]
    expect(sortRosterBands(bands, { key: 'venue', direction: 'asc' }, deps).map(b => getVenueName(b.venue_id))).toEqual(
      ['Blue Room', 'Room 47', 'Roost']
    )
  })

  it('sorts by duration, treating a missing end time as zero', () => {
    const bands = [
      band(1, { start_time: '20:00', end_time: '22:00' }),
      band(2, { start_time: '20:00', end_time: null }),
      band(3, { start_time: '20:00', end_time: '20:30' }),
    ]
    expect(sortRosterBands(bands, { key: 'duration', direction: 'asc' }, deps).map(b => b.id)).toEqual([2, 3, 1])
  })

  it('sorts by festival date, resolving NULL through the fallback', () => {
    const bands = [band(1, { performance_date: '2026-10-12' }), band(2, { performance_date: null })]
    // Band 2's NULL resolves to the event start 2026-10-11, so it sorts first.
    expect(sortRosterBands(bands, { key: 'performance_date', direction: 'asc' }, deps).map(b => b.id)).toEqual([2, 1])
  })

  it('sorts unscheduled sets last in BOTH directions', () => {
    // A set with no start time is not "earliest" — flipping the arrow must not
    // promote it to the top.
    const bands = [band(1, { start_time: null }), band(2, { start_time: '20:00' })]
    expect(sortRosterBands(bands, { key: 'start_time', direction: 'asc' }, deps).map(b => b.id)).toEqual([2, 1])
    expect(sortRosterBands(bands, { key: 'start_time', direction: 'desc' }, deps).map(b => b.id)).toEqual([2, 1])
  })

  it('does not mutate the input array', () => {
    const bands = [band(1, { name: 'Zebra' }), band(2, { name: 'Anchor' })]
    sortRosterBands(bands, { key: 'name', direction: 'asc' }, deps)
    expect(bands.map(b => b.name)).toEqual(['Zebra', 'Anchor'])
  })
})

describe('deriveOriginSuggestions', () => {
  it('collects the structured column and sorts it', () => {
    const bands = [band(1, { origin_city: 'Waterloo' }), band(2, { origin_city: 'Kitchener' })]
    expect(deriveOriginSuggestions(bands, 'city')).toEqual(['Kitchener', 'Waterloo'])
  })

  it('falls back to parsing the legacy freeform origin when the column is empty', () => {
    const bands = [band(1, { origin_city: '', origin: 'Guelph, ON' })]
    expect(deriveOriginSuggestions(bands, 'city')).toEqual(['Guelph'])
  })

  it('prefers the structured column over the freeform string', () => {
    const bands = [band(1, { origin_city: 'Waterloo', origin: 'Toronto, ON' })]
    expect(deriveOriginSuggestions(bands, 'city')).toEqual(['Waterloo'])
  })

  it('de-duplicates', () => {
    const bands = [band(1, { origin_city: 'Waterloo' }), band(2, { origin_city: 'Waterloo' })]
    expect(deriveOriginSuggestions(bands, 'city')).toEqual(['Waterloo'])
  })

  it('reads region independently of city', () => {
    const bands = [band(1, { origin_region: 'ON' }), band(2, { origin_region: 'QC' })]
    expect(deriveOriginSuggestions(bands, 'region')).toEqual(['ON', 'QC'])
  })

  it('includes inactive bands — reusing a retired origin is harmless', () => {
    const bands = [band(1, { is_active: 0, origin_city: 'Tillsonburg' })]
    expect(deriveOriginSuggestions(bands, 'city')).toEqual(['Tillsonburg'])
  })
})

describe('deriveGenreSuggestions', () => {
  // Suggestions come back title-cased via getNormalizedGenreSuggestions, so the
  // datalist offers one canonical spelling rather than whatever casing happened
  // to be typed first. Asserting the normalised form on purpose — expecting the
  // raw input would pass against an implementation that skipped normalisation.
  it('splits the comma-separated column and normalises each entry', () => {
    expect(deriveGenreSuggestions([band(1, { genre: 'punk, ska' })])).toEqual(['Punk', 'Ska'])
  })

  it('trims whitespace and drops empty segments', () => {
    const result = deriveGenreSuggestions([band(1, { genre: ' punk ,, ska ' })])
    expect(result).toEqual(['Punk', 'Ska'])
    expect(result).not.toContain('')
  })

  it('collapses casing variants to one suggestion', () => {
    expect(deriveGenreSuggestions([band(1, { genre: 'PUNK' }), band(2, { genre: 'punk' })])).toEqual(['Punk'])
  })

  it('skips bands with no genre', () => {
    expect(deriveGenreSuggestions([band(1, { genre: null })])).toEqual([])
  })
})

describe('buildDayNumberMap', () => {
  it('numbers from the day OPTIONS, not from the sets present', () => {
    // The distinction matters mid-setup: numbering from data would skip an
    // interior day with no sets booked, so "Day 2" would mean different dates
    // in the dropdown and the table.
    const map = buildDayNumberMap([{ value: '2026-10-11' }, { value: '2026-10-12' }, { value: '2026-10-13' }])
    expect(map.get('2026-10-11')).toBe(1)
    expect(map.get('2026-10-12')).toBe(2)
    expect(map.get('2026-10-13')).toBe(3)
  })

  it('has no entry for a date outside the event span', () => {
    const map = buildDayNumberMap([{ value: '2026-10-11' }])
    expect(map.get('2026-12-25')).toBeUndefined()
  })

  it('is empty for a single-day event, which has no day options', () => {
    expect(buildDayNumberMap([]).size).toBe(0)
  })
})

describe('getActiveBands', () => {
  it('excludes numeric and boolean inactive profiles', () => {
    const bands = [band(1), band(2, { is_active: 0 }), band(3, { is_active: false }), band(4, { is_active: 1 })]
    expect(getActiveBands(bands).map(b => b.id)).toEqual([1, 4])
  })

  it('does not mutate the roster', () => {
    const bands = [band(1)]
    expect(getActiveBands(bands)).not.toBe(bands)
  })
})

describe('buildConflictsByBandId', () => {
  it('maps each performance id to its conflict result', () => {
    const first = band(1, { event_id: 1, venue_id: 2, start_time: '20:00', end_time: '22:00' })
    const second = band(2, { event_id: 1, venue_id: 2, start_time: '21:00', end_time: '23:00' })
    const result = buildConflictsByBandId([first, second], '2026-10-11')
    expect(result.get(1).overlaps).toEqual(['Band 2'])
    expect(result.get(2).overlaps).toEqual(['Band 1'])
  })

  it('returns an empty map for an empty roster', () => {
    expect(buildConflictsByBandId([]).size).toBe(0)
  })
})

describe('mergeConflicts', () => {
  it('combines conflict names while preserving first-seen order', () => {
    expect(
      mergeConflicts({ overlaps: ['A'], conflicts: ['B', 'C'] }, { overlaps: ['A', 'D'], conflicts: ['C'] })
    ).toEqual({
      overlaps: ['A', 'D'],
      conflicts: ['B', 'C'],
    })
  })

  it('handles missing conflict lists', () => {
    expect(mergeConflicts({}, {})).toEqual({ overlaps: [], conflicts: [] })
  })
})

describe('selection helpers', () => {
  it('adds and removes one id without mutating the source set', () => {
    const original = new Set([1])
    expect(updateSelectedIds(original, 2, true)).toEqual(new Set([1, 2]))
    expect(updateSelectedIds(original, 1, false)).toEqual(new Set())
    expect(original).toEqual(new Set([1]))
  })

  it('selects filtered ids or clears the selection', () => {
    const bands = [band(1), band(2)]
    expect(selectAllBandIds(bands, true)).toEqual(new Set([1, 2]))
    expect(selectAllBandIds(bands, false)).toEqual(new Set())
  })
})
