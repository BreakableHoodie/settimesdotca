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

describe('getLifecycleLabel — start-edge gate (#569): doors → first set → midnight', () => {
  // LWBC Vol 17: doors 6:30 PM, first set 6:45 PM, single-day.
  const doorsJson = JSON.stringify({ '2026-08-02': '18:30' })
  const lwbcBands = [band(at(2026, 8, 2, 18, 45), at(2026, 8, 2, 19, 45))]

  it("is Upcoming before doors open on the event's first day", () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 12, 0), lwbcBands, doorsJson)).toBe('Upcoming')
  })

  it('is Live once doors open, even before the first set actually starts', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 18, 35), lwbcBands, doorsJson)).toBe('Live Tonight')
  })

  it('is Live at the exact doors instant (now >= doors, not strictly after)', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 18, 30), lwbcBands, doorsJson)).toBe('Live Tonight')
  })

  it('a set already playing wins over a later doors time (earliest signal wins)', () => {
    // Inconsistent data (doors logged later than the set actually started) —
    // the crawl is provably running, so Live wins regardless of doorsJson.
    const lateDoors = JSON.stringify({ '2026-08-02': '21:00' })
    const bands = [band(at(2026, 8, 2, 19, 0), at(2026, 8, 2, 20, 0))]
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 19, 30), bands, lateDoors)).toBe('Live Tonight')
  })

  it('without doorsJson, falls back to the first set start (Upcoming before, Live after)', () => {
    // Spec: start-edge precedence is doors → first set start → local midnight.
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 12, 0), lwbcBands, null)).toBe('Upcoming')
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 18, 50), lwbcBands, null)).toBe('Live Tonight')
    // 4th arg omitted entirely — exercises the default parameter.
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 12, 0), lwbcBands)).toBe('Upcoming')
  })

  it('with neither doorsJson nor set times, is Live from local midnight (last-resort fallback)', () => {
    const noTimes = [band(0, 0)]
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 0, 30), noTimes, null)).toBe('Live Tonight')
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 12, 0), [], null)).toBe('Live Tonight')
  })

  it('malformed doorsJson is treated as absent (falls back to first set, never throws)', () => {
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 12, 0), lwbcBands, '{not valid json')).toBe('Upcoming')
    expect(labelOf('2026-08-02', new Date(2026, 7, 2, 18, 50), lwbcBands, '{not valid json')).toBe('Live Tonight')
  })

  it("does not re-gate day 2+ of a multi-day event (only the event's first day is gated)", () => {
    // BLR3-style: Friday doors 16:00/first set 19:15, Saturday doors
    // 10:00/first set 12:00. `eventDate` is always the event's first day
    // (Friday) — day-2 (Saturday) morning stays Live via the firstStart
    // rule, same as the existing after-midnight/multi-day behaviour.
    const multiDayDoors = JSON.stringify({ '2026-08-02': '16:00', '2026-08-03': '10:00' })
    const bands = [
      band(at(2026, 8, 2, 19, 15), at(2026, 8, 2, 20, 15)),
      band(at(2026, 8, 3, 12, 0), at(2026, 8, 3, 13, 0)),
    ]
    expect(labelOf('2026-08-02', new Date(2026, 7, 3, 8, 0), bands, multiDayDoors)).toBe('Live Tonight')
  })

  it("day 1 with no sets of its own is Live from midnight — a later day's sets never gate day 1", () => {
    // Regression: day-1 lineup empty, all sets belong to day 2 (`band.date`
    // carries the festival day in multi-day payloads, #543). With no day-1
    // signal at all the midnight fallback applies — day 2's noon set must
    // not hold day 1 at "Upcoming".
    const bands = [{ ...band(at(2026, 8, 3, 12, 0), at(2026, 8, 3, 13, 0)), date: '2026-08-03' }]
    expect(labelOf('2026-08-02', at(2026, 8, 2, 9, 0), bands)).toBe('Live Tonight')
  })

  it('day 1 with no sets still gates on a day-1 doors time when one exists', () => {
    const doors = JSON.stringify({ '2026-08-02': '16:00' })
    const bands = [{ ...band(at(2026, 8, 3, 12, 0), at(2026, 8, 3, 13, 0)), date: '2026-08-03' }]
    expect(labelOf('2026-08-02', at(2026, 8, 2, 9, 0), bands, doors)).toBe('Upcoming')
    expect(labelOf('2026-08-02', at(2026, 8, 2, 16, 30), bands, doors)).toBe('Live Tonight')
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
