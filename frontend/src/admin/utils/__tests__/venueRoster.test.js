import { describe, expect, it } from 'vitest'
import { filterVenues, formatVenueAddress, sortVenues } from '../venueRoster'

const venue = (over = {}) => ({ id: 1, name: 'Blue Room', band_count: 0, ...over })

describe('formatVenueAddress', () => {
  it('composes the structured columns in postal order', () => {
    expect(
      formatVenueAddress(
        venue({
          address_line1: '10 King St N',
          city: 'Waterloo',
          region: 'ON',
          postal_code: 'N2J 2W9',
          country: 'Canada',
        })
      )
    ).toBe('10 King St N, Waterloo, ON, N2J 2W9 Canada')
  })

  it('drops empty segments instead of leaving gaps', () => {
    const result = formatVenueAddress(venue({ address_line1: '10 King St N', country: 'Canada' }))
    expect(result).toBe('10 King St N, Canada')
    expect(result).not.toMatch(/,\s*,/)
  })

  it('falls back to the legacy freeform address only when every column is empty', () => {
    expect(formatVenueAddress(venue({ address: '123 Old Format Rd' }))).toBe('123 Old Format Rd')
  })

  it('prefers structured columns over the legacy address when both exist', () => {
    // A venue mid-migration carries both; the structured columns are newer.
    expect(formatVenueAddress(venue({ city: 'Kitchener', address: '123 Old Format Rd' }))).toBe('Kitchener')
  })

  it('returns empty string for a venue with no address at all', () => {
    expect(formatVenueAddress(venue())).toBe('')
  })

  it('returns empty string for null rather than throwing', () => {
    expect(formatVenueAddress(null)).toBe('')
    expect(formatVenueAddress(undefined)).toBe('')
  })

  it('joins postal code and country with a space, not a comma', () => {
    expect(formatVenueAddress(venue({ postal_code: 'N2J 2W9', country: 'Canada' }))).toBe('N2J 2W9 Canada')
  })
})

describe('filterVenues', () => {
  const venues = [
    venue({ id: 1, name: 'Blue Room', city: 'Waterloo', contact_email: 'a@blue.test' }),
    venue({ id: 2, name: 'Room 47', city: 'Kitchener', phone: '519-555-0199' }),
    venue({ id: 3, name: 'Roost', address_line1: '10 King St N', region: 'ON' }),
  ]

  it('returns everything for an empty or whitespace-only search', () => {
    expect(filterVenues(venues, '')).toHaveLength(3)
    expect(filterVenues(venues, '   ')).toHaveLength(3)
  })

  it('matches on name, case-insensitively', () => {
    expect(filterVenues(venues, 'BLUE').map(v => v.id)).toEqual([1])
  })

  it('matches on city', () => {
    expect(filterVenues(venues, 'kitchener').map(v => v.id)).toEqual([2])
  })

  it('matches on contact email and phone', () => {
    expect(filterVenues(venues, 'a@blue').map(v => v.id)).toEqual([1])
    expect(filterVenues(venues, '0199').map(v => v.id)).toEqual([2])
  })

  it('matches the COMPOSED address, not just raw columns', () => {
    // An operator types what the table shows. This query SPANS two structured
    // fields and includes the display separator, so it exists only in the
    // composed string — a filter reading raw columns matches nothing.
    // (A query like "10 king" would not prove this: it lives in address_line1.)
    expect(filterVenues(venues, '10 king st n, on').map(v => v.id)).toEqual([3])
  })

  it('does not throw on venues with missing optional fields', () => {
    expect(() => filterVenues([venue({ name: null })], 'x')).not.toThrow()
  })
})

describe('sortVenues', () => {
  it('returns the list untouched when no sort key is set', () => {
    const venues = [venue({ id: 2, name: 'Zed' }), venue({ id: 1, name: 'Alpha' })]
    expect(sortVenues(venues, { key: null }).map(v => v.id)).toEqual([2, 1])
  })

  it('sorts band_count NUMERICALLY, not as a string', () => {
    // The bug this catches: a lexicographic compare puts "10" before "9".
    const venues = [venue({ id: 1, band_count: 9 }), venue({ id: 2, band_count: 10 })]
    expect(sortVenues(venues, { key: 'band_count', direction: 'asc' }).map(v => v.band_count)).toEqual([9, 10])
  })

  it('treats a missing band_count as zero', () => {
    const venues = [venue({ id: 1, band_count: 3 }), venue({ id: 2, band_count: undefined })]
    expect(sortVenues(venues, { key: 'band_count', direction: 'asc' }).map(v => v.id)).toEqual([2, 1])
  })

  it('sorts by the COMPOSED address, not the raw column', () => {
    // Structured-only venue vs legacy-only venue: a sort reading `address`
    // directly would treat the first as empty and mis-order them.
    const venues = [venue({ id: 1, city: 'Waterloo' }), venue({ id: 2, address: 'Aardvark St' })]
    expect(sortVenues(venues, { key: 'address', direction: 'asc' }).map(v => v.id)).toEqual([2, 1])
  })

  it('sorts arbitrary string columns case-insensitively', () => {
    const venues = [venue({ id: 1, name: 'zebra' }), venue({ id: 2, name: 'Alpha' })]
    expect(sortVenues(venues, { key: 'name', direction: 'asc' }).map(v => v.id)).toEqual([2, 1])
  })

  it('reverses on desc', () => {
    const venues = [venue({ id: 1, name: 'Alpha' }), venue({ id: 2, name: 'Zebra' })]
    expect(sortVenues(venues, { key: 'name', direction: 'desc' }).map(v => v.id)).toEqual([2, 1])
  })

  it('sorts venues with a null column last-ish without throwing', () => {
    const venues = [venue({ id: 1, name: null }), venue({ id: 2, name: 'Alpha' })]
    expect(() => sortVenues(venues, { key: 'name', direction: 'asc' })).not.toThrow()
  })

  it('does not mutate the input array', () => {
    const venues = [venue({ id: 2, name: 'Zed' }), venue({ id: 1, name: 'Alpha' })]
    sortVenues(venues, { key: 'name', direction: 'asc' })
    expect(venues.map(v => v.id)).toEqual([2, 1])
  })
})
