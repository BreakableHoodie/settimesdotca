import { describe, expect, it } from 'vitest'
import { buildPerformancePayload, parseDuration } from '../lineupForm'

describe('parseDuration', () => {
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
