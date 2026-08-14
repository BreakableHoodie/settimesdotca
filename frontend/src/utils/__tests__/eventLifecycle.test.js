import { describe, expect, it } from 'vitest'
import { getDaysSinceEvent } from '../eventLifecycle'

// These fixtures only mean anything in a DST-observing zone: in UTC there is
// no transition, so every case below passes against the pre-#770 code too.
// frontend/vitest.config.js pins TZ=America/Toronto for exactly this reason.
describe('getDaysSinceEvent', () => {
  it('is pinned to a DST-observing timezone', () => {
    // Guards the guard: if the TZ pin is ever dropped, the DST cases below
    // silently stop testing anything rather than failing.
    const jan = new Date('2026-01-15T12:00:00').getTimezoneOffset()
    const jul = new Date('2026-07-15T12:00:00').getTimezoneOffset()
    expect(jan).not.toBe(jul)
  })

  // `undefined` is the repo's convention for an absent optional value
  // (instructions/nodejs-javascript-vitest.instructions.md), but `null` is
  // what actually arrives at runtime: `event.date` is deserialized from D1,
  // where a NULL column becomes JSON null. Both are asserted deliberately.
  it('returns -1 for a missing or empty event date', () => {
    expect(getDaysSinceEvent(undefined)).toBe(-1)
    expect(getDaysSinceEvent(null)).toBe(-1)
    expect(getDaysSinceEvent('')).toBe(-1)
  })

  it('counts whole calendar days for standard dates', () => {
    expect(getDaysSinceEvent('2026-08-10', new Date('2026-08-13T23:59:59'))).toBe(3)
  })

  it('returns 0 on the event date itself, at any hour', () => {
    expect(getDaysSinceEvent('2026-08-10', new Date('2026-08-10T00:00:01'))).toBe(0)
    expect(getDaysSinceEvent('2026-08-10', new Date('2026-08-10T12:00:00'))).toBe(0)
    expect(getDaysSinceEvent('2026-08-10', new Date('2026-08-10T23:59:59'))).toBe(0)
  })

  // #770 regression: Math.round on elapsed milliseconds rounded a half-day up,
  // so the day after an event drifted from 0 to 1 partway through the morning.
  // Calendar differencing pins the whole date to a single value.
  it('reports a stable 1 for every hour of the day after the event', () => {
    for (const hour of ['00:00:01', '06:00:00', '12:00:00', '18:00:00', '23:59:59']) {
      expect(getDaysSinceEvent('2026-08-10', new Date(`2026-08-11T${hour}`))).toBe(1)
    }
  })

  it('crosses the fall-back DST transition (2026-11-01, a 25-hour day)', () => {
    expect(getDaysSinceEvent('2026-10-31', new Date('2026-11-01T23:59:59'))).toBe(1)
    expect(getDaysSinceEvent('2026-10-31', new Date('2026-11-01T00:30:00'))).toBe(1)
  })

  // #770 original report: a 23-hour day made Math.floor(23/24) return 0 for a
  // full calendar day.
  it('crosses the spring-forward DST transition (2027-03-14, a 23-hour day)', () => {
    expect(getDaysSinceEvent('2027-03-13', new Date('2027-03-14T23:59:59'))).toBe(1)
    expect(getDaysSinceEvent('2027-03-13', new Date('2027-03-14T04:00:00'))).toBe(1)
  })

  // #770 regression: Math.round produced -0 for a near-future event, which
  // renders as "0" and reads as "ended today".
  it('returns a strictly negative count for future events', () => {
    const tomorrow = getDaysSinceEvent('2026-08-14', new Date('2026-08-13T23:00:00'))
    expect(tomorrow).toBe(-1)
    expect(Object.is(tomorrow, -0)).toBe(false)
    expect(getDaysSinceEvent('2026-08-16', new Date('2026-08-13T12:00:00'))).toBe(-3)
  })

  it('accepts a string or numeric referenceTime', () => {
    expect(getDaysSinceEvent('2026-08-10', '2026-08-12T09:00:00')).toBe(2)
    expect(getDaysSinceEvent('2026-08-10', new Date('2026-08-12T09:00:00').getTime())).toBe(2)
  })
})
