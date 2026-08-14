import { describe, expect, it } from 'vitest'
import { buildDirectionsHref, buildDirectionsHrefForBand } from '../directions'

// #742 — the venue page hands a fan's phone off to whichever maps app it has.
// Assert on the resolved href string itself, not merely that a value comes
// back -- a broken query string or a raw (unencoded) interpolation would
// still pass a "returns truthy" check.
describe('buildDirectionsHref (#742)', () => {
  it('builds an encoded Google Maps search URL from venue name + address', () => {
    const href = buildDirectionsHref('The Mill (Main Stage)', '20 John Pound Road, Tillsonburg, ON')
    expect(href).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('The Mill (Main Stage), 20 John Pound Road, Tillsonburg, ON')
    )
  })

  it('returns null when address is missing, even with a name', () => {
    expect(buildDirectionsHref('The Mill', null)).toBeNull()
    expect(buildDirectionsHref('The Mill', undefined)).toBeNull()
    expect(buildDirectionsHref('The Mill', '')).toBeNull()
  })

  it('falls back to the address alone when name is missing', () => {
    const href = buildDirectionsHref(null, '20 John Pound Road, Tillsonburg, ON')
    expect(href).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('20 John Pound Road, Tillsonburg, ON')
    )
  })

  it('encodes special characters so the query is never raw-interpolated', () => {
    const href = buildDirectionsHref("Bob & Ray's", '1 Main St, Unit #2, Waterloo, ON')
    expect(href).not.toContain('&Ray')
    expect(href).not.toContain('#2')
    expect(href).toContain(encodeURIComponent("Bob & Ray's, 1 Main St, Unit #2, Waterloo, ON"))
  })
})

// A whitespace-only address is truthy, so the original `if (!address)` guard
// let it through and produced a link to an empty map query. It IS reachable:
// formatAddress() in functions/api/venues/[id].js joins parts with
// filter(Boolean), which keeps a "   " address_line1.
describe('buildDirectionsHref — blank-ish input', () => {
  it.each([['   '], ['\t'], ['\n  \n']])('returns null for whitespace-only address %j', blank => {
    expect(buildDirectionsHref('The Mill', blank)).toBeNull()
  })

  it('returns null for a non-string address', () => {
    expect(buildDirectionsHref('The Mill', undefined)).toBeNull()
    expect(buildDirectionsHref('The Mill', null)).toBeNull()
  })

  it('trims surrounding whitespace instead of encoding it into the query', () => {
    const href = buildDirectionsHref('  The Mill  ', '  20 John Pound Road  ')
    expect(href).toBe('https://www.google.com/maps/search/?api=1&query=The%20Mill%2C%2020%20John%20Pound%20Road')
  })

  it('falls back to the address alone when the name is whitespace-only', () => {
    const href = buildDirectionsHref('   ', '20 John Pound Road')
    expect(href).toBe('https://www.google.com/maps/search/?api=1&query=20%20John%20Pound%20Road')
  })
})

// Migrated from utils/__tests__/nextMove.test.js — buildDirectionsHrefForBand
// used to be nextMove.js's own directionsHref(band); #754's correction found
// it was never folded into this file despite #753 assuming it had been.
describe('buildDirectionsHrefForBand (#754)', () => {
  it('builds a coordinate directions link when coords are present', () => {
    const href = buildDirectionsHrefForBand({ venue: 'Roost', venue_lat: 43.46, venue_lng: -80.52 })
    expect(href).toBe('https://www.google.com/maps/dir/?api=1&destination=43.46,-80.52')
  })

  it('falls back to a name search scoped to the venue city when coords are missing', () => {
    const href = buildDirectionsHrefForBand({ venue: 'The Roost', venue_city: 'Waterloo' })
    expect(href).toContain('/maps/search/')
    expect(href).toContain(encodeURIComponent('The Roost Waterloo'))
  })

  it('falls back to a bare venue-name search when coords AND city are missing', () => {
    const href = buildDirectionsHrefForBand({ venue: 'The Roost' })
    expect(href).toContain('/maps/search/')
    expect(href).toContain(encodeURIComponent('The Roost'))
    expect(href).not.toContain('Waterloo')
  })

  // Bad coordinates must degrade to the venue-name search, not build a pin
  // that lands nowhere. A fan mid-crawl can still navigate from a name; they
  // cannot navigate from "destination=Infinity,Infinity".
  it.each([
    ['Infinity', Infinity, Infinity],
    ['-Infinity', -Infinity, -Infinity],
    ['NaN', NaN, NaN],
    ['out-of-range latitude', 91, -80.52],
    ['out-of-range longitude', 43.46, 181],
    ['string coords', '43.46', '-80.52'],
  ])('falls back to the name search for %s coords', (_label, lat, lng) => {
    const href = buildDirectionsHrefForBand({ venue: 'Roost', venue_city: 'Waterloo', venue_lat: lat, venue_lng: lng })
    expect(href).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Roost Waterloo'))
  })

  it('trims surrounding whitespace from the city qualifier', () => {
    const href = buildDirectionsHrefForBand({ venue: 'The Roost', venue_city: '  Waterloo, ON  ' })
    expect(href).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('The Roost Waterloo, ON'))
  })

  it('ignores a non-string city and searches by venue name alone', () => {
    const href = buildDirectionsHrefForBand({ venue: 'The Roost', venue_city: 42 })
    expect(href).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('The Roost'))
  })

  it('returns null when coords are unusable and there is no venue name', () => {
    expect(buildDirectionsHrefForBand({ venue_lat: Infinity, venue_lng: Infinity })).toBe(null)
  })

  // A whitespace-only venue is truthy, so an untrimmed check would search for
  // "   Waterloo ON" — a link to nowhere. Matches buildDirectionsHref's
  // trimming invariant.
  it.each([
    ['whitespace-only', '   '],
    ['empty', ''],
    ['non-string', 42],
  ])('returns null for a %s venue name with no usable coords', (_label, venue) => {
    expect(buildDirectionsHrefForBand({ venue })).toBe(null)
  })

  it('returns null when there is nothing to locate', () => {
    expect(buildDirectionsHrefForBand({})).toBe(null)
    expect(buildDirectionsHrefForBand(null)).toBe(null)
  })
})
