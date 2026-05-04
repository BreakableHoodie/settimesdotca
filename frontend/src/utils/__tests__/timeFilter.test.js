import { describe, it, expect } from 'vitest'
import { isStartingSoon } from '../timeFilter.js'

const NOW = 1_000_000_000_000 // fixed timestamp, 2001-09-08T21:46:40Z

describe('isStartingSoon', () => {
  it('returns false when startMs is 0', () => {
    expect(isStartingSoon({ startMs: 0 }, NOW)).toBe(false)
  })

  it('returns false when startMs is undefined', () => {
    expect(isStartingSoon({ startMs: undefined }, NOW)).toBe(false)
  })

  it('returns false when start is already past (1 ms ago)', () => {
    expect(isStartingSoon({ startMs: NOW - 1 }, NOW)).toBe(false)
  })

  it('returns false when start is more than 30 min away (31 min)', () => {
    expect(isStartingSoon({ startMs: NOW + 31 * 60_000 }, NOW)).toBe(false)
  })

  it('returns false exactly at 30 min + 1 ms boundary', () => {
    expect(isStartingSoon({ startMs: NOW + 30 * 60_000 + 1 }, NOW)).toBe(false)
  })

  it('returns true when exactly 30 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 30 * 60_000 }, NOW)).toBe(true)
  })

  it('returns true when 29 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 29 * 60_000 }, NOW)).toBe(true)
  })

  it('returns true when 1 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 1 * 60_000 }, NOW)).toBe(true)
  })

  it('respects custom thresholdMinutes', () => {
    expect(isStartingSoon({ startMs: NOW + 10 * 60_000 }, NOW, 5)).toBe(false)
    expect(isStartingSoon({ startMs: NOW + 4 * 60_000 }, NOW, 5)).toBe(true)
  })
})
