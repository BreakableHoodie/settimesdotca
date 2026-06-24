import { describe, it, expect } from 'vitest'
import { computeNextMove, directionsHref, LIVE_WINDOW_MIN } from '../nextMove'

const BASE = new Date('2026-08-02T20:00:00').getTime()
const now = new Date(BASE)
const min = n => n * 60000

// Build a band relative to `now`. startOffMin/endOffMin are minutes from now.
const band = (over = {}) => ({
  id: 1,
  name: 'Band',
  venue: 'Venue A',
  venue_lat: 43.4683,
  venue_lng: -80.5226,
  startMs: BASE + min(30),
  endMs: BASE + min(60),
  ...over,
})

describe('computeNextMove', () => {
  it('returns null when there are no bands', () => {
    expect(computeNextMove([], now).kind).toBe(null)
  })

  it('returns null when the next set is beyond the live window', () => {
    const far = band({ startMs: BASE + min(LIVE_WINDOW_MIN + 30), endMs: BASE + min(LIVE_WINDOW_MIN + 60) })
    expect(computeNextMove([far], now).kind).toBe(null)
  })

  it('reports "watching" for a set playing now, with minutes left', () => {
    const live = band({ startMs: BASE - min(10), endMs: BASE + min(20) })
    const state = computeNextMove([live], now)
    expect(state.kind).toBe('watching')
    expect(state.nowBand.id).toBe(live.id)
    expect(state.minutesLeft).toBe(20)
  })

  it('includes the next set while watching', () => {
    const live = band({ id: 1, startMs: BASE - min(10), endMs: BASE + min(20) })
    const next = band({ id: 2, name: 'Next', startMs: BASE + min(25), endMs: BASE + min(55) })
    const state = computeNextMove([live, next], now)
    expect(state.kind).toBe('watching')
    expect(state.nextBand.id).toBe(2)
    expect(state.minutesToNext).toBe(25)
  })

  it('reports "decide" when two saved sets play at the same time now', () => {
    const a = band({ id: 1, name: 'A', startMs: BASE - min(5), endMs: BASE + min(25) })
    const b = band({ id: 2, name: 'B', venue: 'Venue B', startMs: BASE - min(2), endMs: BASE + min(28) })
    const state = computeNextMove([a, b], now)
    expect(state.kind).toBe('decide')
    expect(state.conflict).toHaveLength(2)
  })

  it('reports "decide" when the next two saved sets overlap', () => {
    const a = band({ id: 1, name: 'A', startMs: BASE + min(10), endMs: BASE + min(40) })
    const b = band({ id: 2, name: 'B', venue: 'Venue B', startMs: BASE + min(20), endMs: BASE + min(50) })
    const state = computeNextMove([a, b], now)
    expect(state.kind).toBe('decide')
    expect(state.conflict.map(x => x.id).sort()).toEqual([1, 2])
  })

  it('reports "move" when the previous set ended at a different venue', () => {
    const prev = band({ id: 1, name: 'Prev', venue: 'Venue A', startMs: BASE - min(40), endMs: BASE - min(5) })
    const next = band({
      id: 2,
      name: 'Next',
      venue: 'Venue B',
      venue_lat: 43.4699,
      venue_lng: -80.521,
      startMs: BASE + min(20),
      endMs: BASE + min(50),
    })
    const state = computeNextMove([prev, next], now)
    expect(state.kind).toBe('move')
    expect(state.nextBand.id).toBe(2)
    expect(typeof state.walkMin).toBe('number')
    expect(state.slackMin).toBe(state.minutesToNext - state.walkMin)
  })

  it('reports "upnext" when the next set is soon and no venue change applies', () => {
    const next = band({ id: 2, name: 'Next', startMs: BASE + min(30), endMs: BASE + min(60) })
    const state = computeNextMove([next], now)
    expect(state.kind).toBe('upnext')
    expect(state.minutesToNext).toBe(30)
  })

  it('"watching" takes precedence over an upcoming move', () => {
    const live = band({ id: 1, startMs: BASE - min(5), endMs: BASE + min(25) })
    const next = band({ id: 2, venue: 'Venue B', startMs: BASE + min(30), endMs: BASE + min(60) })
    expect(computeNextMove([live, next], now).kind).toBe('watching')
  })
})

describe('directionsHref', () => {
  it('builds a coordinate directions link when coords are present', () => {
    const href = directionsHref({ venue: 'Roost', venue_lat: 43.46, venue_lng: -80.52 })
    expect(href).toBe('https://www.google.com/maps/dir/?api=1&destination=43.46,-80.52')
  })

  it('falls back to a name search when coords are missing', () => {
    const href = directionsHref({ venue: 'The Roost' })
    expect(href).toContain('/maps/search/')
    expect(href).toContain(encodeURIComponent('The Roost Waterloo ON'))
  })

  it('returns null when there is nothing to locate', () => {
    expect(directionsHref({})).toBe(null)
    expect(directionsHref(null)).toBe(null)
  })
})
