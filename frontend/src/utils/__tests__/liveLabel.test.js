import { describe, it, expect } from 'vitest'
import { getLifecycleLabel, isSameLocalDay } from '../liveLabel'

// Local-time epoch ms (month is 1-based here for readability). Mirrors how
// prepareBands parses `${date}T${time}` — local, no offset.
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const band = (startMs, endMs) => ({ startMs, endMs })

const labelOf = (...args) => getLifecycleLabel(...args).label

describe('getLifecycleLabel — after-midnight sets (#558)', () => {
  // Evening set 20:00–21:00 on Aug 2, plus a 1 AM set that prepareBands has
  // offset to Aug 3 01:00–02:00 (it belongs to Aug 2's festival day).
  const bands = [band(at(2026, 8, 2, 20), at(2026, 8, 2, 21)), band(at(2026, 8, 3, 1), at(2026, 8, 3, 2))]

  it('stays "Live Tonight" at 1:30 AM while the after-midnight set is playing', () => {
    // The bug: the old date-based logic flipped to "Recap" at midnight here.
    expect(labelOf('2026-08-02', new Date(2026, 7, 3, 1, 30), bands)).toBe('Live Tonight')
  })

  it('flips to "Recap" only after the last set actually ends', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 3, 2, 30), bands)).toBe('Recap')
  })

  it('archives 48h after the real last-set end, not after midnight', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 3, 1, 30), bands)).toBe('Live Tonight') // still live
    expect(labelOf('2026-08-02', new Date(2026, 7, 5, 3, 0), bands)).toBe('Archive') // >48h past 02:00
    expect(labelOf('2026-08-02', new Date(2026, 7, 5, 1, 0), bands)).toBe('Recap') // <48h past
  })
})

describe('getLifecycleLabel — single-day (no after-midnight) is byte-identical', () => {
  // Last set ends 23:00, before the 23:59:59 day boundary → liveEnd = day end.
  const bands = [band(at(2026, 8, 2, 20), at(2026, 8, 2, 21)), band(at(2026, 8, 2, 22), at(2026, 8, 2, 23))]

  it('is Live during the event day', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 22, 30), bands)).toBe('Live Tonight')
  })

  it('stays Live between the last set and midnight (unchanged from before)', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 23, 30), bands)).toBe('Live Tonight')
  })

  it('flips to Recap at midnight (unchanged from before)', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 3, 0, 30), bands)).toBe('Recap')
  })
})

describe('getLifecycleLabel — no set times entered yet (date-based fallback)', () => {
  const noTimes = [band(0, 0), band(0, 0)] // prepareBands sets 0 for untimed bands

  it('is Live on the event day even with no times', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 15, 0), noTimes)).toBe('Live Tonight')
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 15, 0), [])).toBe('Live Tonight')
  })

  it('is Upcoming before the event day', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 1, 12, 0), noTimes)).toBe('Upcoming')
  })

  it('is Recap within 48h after, Archive beyond', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 3, 12, 0), noTimes)).toBe('Recap')
    expect(labelOf('2026-08-02', new Date(2026, 7, 6, 12, 0), noTimes)).toBe('Archive')
  })

  it('defaults to Upcoming with neither date nor times', () => {
    expect(labelOf(null, new Date(2026, 7, 2, 15, 0), [])).toBe('Upcoming')
  })
})

describe('isSameLocalDay', () => {
  it('matches the event calendar day', () => {
    expect(isSameLocalDay('2026-08-02', new Date(2026, 7, 2, 23, 0))).toBe(true)
  })
  it('is false after midnight (next calendar day)', () => {
    expect(isSameLocalDay('2026-08-02', new Date(2026, 7, 3, 1, 0))).toBe(false)
  })
  it('is false with no eventDate', () => {
    expect(isSameLocalDay(null, new Date())).toBe(false)
  })
})
