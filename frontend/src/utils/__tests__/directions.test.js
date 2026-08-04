import { describe, expect, it } from 'vitest'
import { buildDirectionsHref } from '../directions'

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
