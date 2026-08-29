import { describe, expect, it } from 'vitest'
import { buildPerformancePayload, parseDuration } from '../lineupForm'
import { LINK_FIELDS } from '../bandFields'

describe('parseDuration', () => {
  it('rejects a positive value that ROUNDS to zero', () => {
    // 0.4 passes the `parsed <= 0` guard but Math.round makes it 0, and a
    // 0-minute duration gives the performance identical start and end times —
    // the zero-length-set condition the server rejects in validateSetTimes.
    expect(parseDuration('0.4')).toBeNull()
    expect(parseDuration(0.4)).toBeNull()
    expect(parseDuration('0.49')).toBeNull()
  })

  it('still accepts a value that rounds UP to a real duration', () => {
    expect(parseDuration('0.6')).toBe(1)
    expect(parseDuration('44.5')).toBe(45)
  })

  it('rounds positive numeric input', () => {
    expect(parseDuration('45.6')).toBe(46)
    expect(parseDuration(30)).toBe(30)
  })

  it('rejects empty, non-finite, and non-positive input', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('not a duration')).toBeNull()
    expect(parseDuration(0)).toBeNull()
    expect(parseDuration(-10)).toBeNull()
    expect(parseDuration(Infinity)).toBeNull()
  })
})

describe('buildPerformancePayload', () => {
  it('maps form fields and serializes social links', () => {
    const payload = buildPerformancePayload({
      event_id: '37',
      venue_id: '4',
      name: 'The Band',
      start_time: '20:00',
      end_time: '21:00',
      performance_date: '2026-10-11',
      notes: 'Main room',
      genre: 'Rock',
      origin_city: 'Kitchener',
      origin_region: 'ON',
      contact_email: 'band@example.com',
      is_active: '1',
      description: 'A band',
      photo_url: '/photo.jpg',
      photo_alt_text: 'The Band',
      website: 'https://example.com',
      instagram: '@theband',
      bandcamp: '',
      facebook: '',
      youtube: '',
      spotify: '',
      apple_music: '',
      linktree: '',
      url: 'https://example.com/music',
    })

    expect(payload).toMatchObject({
      eventId: 37,
      venueId: 4,
      performanceDate: '2026-10-11',
      origin: 'Kitchener, ON',
      is_active: true,
    })
    expect(JSON.parse(payload.social_links)).toEqual({
      website: 'https://example.com',
      instagram: '@theband',
      bandcamp: '',
      facebook: '',
      youtube: '',
      spotify: '',
      apple_music: '',
      linktree: '',
    })
  })

  it('keeps empty optional values compatible with the existing payload', () => {
    const payload = buildPerformancePayload({
      event_id: '37',
      venue_id: '',
      performance_date: '',
      origin_city: '',
      origin_region: '',
      is_active: 0,
    })

    expect(payload.venueId).toBeNull()
    expect(payload.performanceDate).toBeNull()
    expect(payload.origin).toBe('')
    expect(payload.is_active).toBe(false)
    expect(JSON.parse(payload.social_links)).toEqual({
      website: '',
      instagram: '',
      bandcamp: '',
      facebook: '',
      youtube: '',
      spotify: '',
      apple_music: '',
      linktree: '',
    })
  })
})

describe('social_links derivation', () => {
  it('carries every LINK_FIELDS key, so a ninth platform cannot be dropped here', () => {
    // This used to be eight hardcoded keys — a second list of link fields, which
    // is what bandFields.js exists to prevent. Adding a platform to the registry
    // and forgetting this write path is precisely the bug that shape invites.
    const payload = buildPerformancePayload({ event_id: '1', name: 'n' })
    const links = JSON.parse(payload.social_links)
    expect(Object.keys(links).sort()).toEqual(LINK_FIELDS.map(f => f.key).sort())
  })

  it('preserves a supplied value and defaults an absent one to an empty string', () => {
    const payload = buildPerformancePayload({ event_id: '1', name: 'n', instagram: 'someband' })
    const links = JSON.parse(payload.social_links)
    expect(links.instagram).toBe('someband')
    expect(links.spotify).toBe('')
  })
})
