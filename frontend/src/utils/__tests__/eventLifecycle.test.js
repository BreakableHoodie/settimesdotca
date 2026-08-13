import { describe, expect, it } from 'vitest'
import { getDaysSinceEvent } from '../eventLifecycle'

describe('getDaysSinceEvent', () => {
  it('returns -1 for empty or missing event date', () => {
    expect(getDaysSinceEvent(null)).toBe(-1)
    expect(getDaysSinceEvent('')).toBe(-1)
  })

  it('calculates days elapsed for standard non-transition dates', () => {
    // Event ended on 2026-08-10 at 23:59:59
    // Reference time: 2026-08-13 at 23:59:59 (3 days later)
    expect(getDaysSinceEvent('2026-08-10', new Date('2026-08-13T23:59:59'))).toBe(3)
  })

  it('correctly calculates days elapsed across fall-back DST transition (2026-11-01, 25h day)', () => {
    // Event ended on 2026-10-31 at 23:59:59
    // Reference time: 2026-11-01 at 23:59:59 (1 day later, 25 wall-clock hours)
    expect(getDaysSinceEvent('2026-10-31', new Date('2026-11-01T23:59:59'))).toBe(1)
  })

  it('correctly calculates days elapsed across spring-forward DST transition (2027-03-14, 23h day)', () => {
    // Event ended on 2027-03-13 at 23:59:59
    // Reference time: 2027-03-14 at 23:59:59 (1 day later, 23 wall-clock hours)
    // #770: Math.floor previously returned 0 due to 23h / 24h < 1
    expect(getDaysSinceEvent('2027-03-13', new Date('2027-03-14T23:59:59'))).toBe(1)
  })
})
