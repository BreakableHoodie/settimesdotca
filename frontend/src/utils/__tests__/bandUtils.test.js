import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { prepareBands } from '../bandUtils'

const DAY_MS = 24 * 60 * 60 * 1000

// Helper to build a minimal band object
const makeBand = (startTime, endTime, date = '2024-06-01') => ({
  id: '1',
  name: 'Test Band',
  date,
  startTime,
  endTime,
  venue: 'Stage A',
})

describe('prepareBands', () => {
  it('sets correct startMs and endMs for a normal evening set', () => {
    const [band] = prepareBands([makeBand('21:00', '22:30')])
    const expectedStart = Date.parse('2024-06-01T21:00:00')
    const expectedEnd = Date.parse('2024-06-01T22:30:00')
    expect(band.startMs).toBe(expectedStart)
    expect(band.endMs).toBe(expectedEnd)
  })

  it('handles end time crossing midnight (start 23:00, end 01:00)', () => {
    const [band] = prepareBands([makeBand('23:00', '01:00')])
    const baseStart = Date.parse('2024-06-01T23:00:00')
    const baseEnd = Date.parse('2024-06-01T01:00:00')
    expect(band.startMs).toBe(baseStart)
    // end is the next day
    expect(band.endMs).toBe(baseEnd + DAY_MS)
  })

  // Bug 1: after-midnight start times must sort after evening sets, not before them
  it('offsets after-midnight start (01:00) so it sorts after evening sets (23:00)', () => {
    const eveningBand = prepareBands([makeBand('23:00', '00:00')])[0]
    const afterMidnightBand = prepareBands([makeBand('01:00', '02:00')])[0]
    expect(afterMidnightBand.startMs).toBeGreaterThan(eveningBand.startMs)
  })

  it('offsets both startMs and endMs for a fully after-midnight set (01:00–02:00)', () => {
    const [band] = prepareBands([makeBand('01:00', '02:00')])
    const baseStart = Date.parse('2024-06-01T01:00:00')
    const baseEnd = Date.parse('2024-06-01T02:00:00')
    expect(band.startMs).toBe(baseStart + DAY_MS)
    expect(band.endMs).toBe(baseEnd + DAY_MS)
  })

  it('treats 05:59 as after-midnight', () => {
    const [band] = prepareBands([makeBand('05:59', '06:30')])
    const baseStart = Date.parse('2024-06-01T05:59:00')
    expect(band.startMs).toBe(baseStart + DAY_MS)
  })

  it('treats 06:00 as same-day (not after-midnight)', () => {
    const [band] = prepareBands([makeBand('06:00', '07:00')])
    const expectedStart = Date.parse('2024-06-01T06:00:00')
    expect(band.startMs).toBe(expectedStart)
  })

  it('sets startMs and endMs to 0 when times are missing', () => {
    const [band] = prepareBands([makeBand(undefined, undefined)])
    expect(band.startMs).toBe(0)
    expect(band.endMs).toBe(0)
  })

  it('handles missing endTime (startMs computed, endMs 0)', () => {
    const [band] = prepareBands([makeBand('20:00', undefined)])
    expect(band.startMs).toBe(Date.parse('2024-06-01T20:00:00'))
    expect(band.endMs).toBe(0)
  })

  it('returns empty array for empty input', () => {
    expect(prepareBands([])).toEqual([])
  })

  it('preserves all other band properties', () => {
    const input = { ...makeBand('20:00', '21:00'), genre: 'punk', foo: 'bar' }
    const [result] = prepareBands([input])
    expect(result.genre).toBe('punk')
    expect(result.foo).toBe('bar')
    expect(result.name).toBe('Test Band')
  })

  it('correctly sorts: 23:00 band before 01:00 after-midnight band', () => {
    const bands = prepareBands([makeBand('01:00', '02:00'), makeBand('23:00', '00:00')])
    const sorted = [...bands].sort((a, b) => a.startMs - b.startMs)
    expect(sorted[0].startTime).toBe('23:00')
    expect(sorted[1].startTime).toBe('01:00')
  })
})

describe('prepareBands — midnight-spanning real-world cases', () => {
  // These are the three types of sets a festival schedule will have:
  //  A) Evening set that ends just past midnight  (23:40–00:10)
  //  B) After-midnight set starting at 12:xx AM   (00:15–01:05)
  //  C) After-midnight set starting at  1:xx AM   (01:10–01:40)

  it('A: 11:40 PM → 12:10 AM (23:40–00:10) — end crosses midnight, startMs stays same day', () => {
    const [band] = prepareBands([makeBand('23:40', '00:10')])
    const expectedStart = Date.parse('2024-06-01T23:40:00')
    const expectedEnd = Date.parse('2024-06-01T00:10:00') + DAY_MS // next day
    expect(band.startMs).toBe(expectedStart)
    expect(band.endMs).toBe(expectedEnd)
  })

  it('B: 12:15 AM → 1:05 AM (00:15–01:05) — fully after midnight, both offset +1 day', () => {
    const [band] = prepareBands([makeBand('00:15', '01:05')])
    const expectedStart = Date.parse('2024-06-01T00:15:00') + DAY_MS
    const expectedEnd = Date.parse('2024-06-01T01:05:00') + DAY_MS
    expect(band.startMs).toBe(expectedStart)
    expect(band.endMs).toBe(expectedEnd)
  })

  it('C: 1:10 AM → 1:40 AM (01:10–01:40) — fully after midnight, both offset +1 day', () => {
    const [band] = prepareBands([makeBand('01:10', '01:40')])
    const expectedStart = Date.parse('2024-06-01T01:10:00') + DAY_MS
    const expectedEnd = Date.parse('2024-06-01T01:40:00') + DAY_MS
    expect(band.startMs).toBe(expectedStart)
    expect(band.endMs).toBe(expectedEnd)
  })

  it('all three types sort correctly: A < B < C', () => {
    const input = [
      makeBand('00:15', '01:05'), // B — appears first in array but should sort second
      makeBand('01:10', '01:40'), // C
      makeBand('23:40', '00:10'), // A — should be first despite "23" > "01" string comparison
    ]
    const bands = prepareBands(input)
    const sorted = [...bands].sort((a, b) => a.startMs - b.startMs)
    expect(sorted[0].startTime).toBe('23:40') // A: 11:40 PM
    expect(sorted[1].startTime).toBe('00:15') // B: 12:15 AM
    expect(sorted[2].startTime).toBe('01:10') // C: 1:10 AM
  })

  it('A endMs < B startMs (no overlap between crossing-midnight and after-midnight sets)', () => {
    const [bandA] = prepareBands([makeBand('23:40', '00:10')])
    const [bandB] = prepareBands([makeBand('00:15', '01:05')])
    expect(bandA.endMs).toBeLessThan(bandB.startMs)
  })
})

describe('prepareBands — multi-day festival-day support (#538)', () => {
  // prepareBands keys entirely off each band's own `date` field (its festival
  // day), so it already generalizes to N days with NO code change — see the
  // comment above prepareBands in bandUtils.js. This pins that: two sets with
  // different `date`s sort correctly and land exactly one day apart, without
  // any date-aware logic beyond what already existed.
  it("sorts sets from different festival days using each set's own date, 24h apart", () => {
    const bands = prepareBands([
      makeBand('20:00', '23:00', '2026-08-03'), // Day 2 evening
      makeBand('20:00', '23:00', '2026-08-02'), // Day 1 evening
    ])
    const sorted = [...bands].sort((a, b) => a.startMs - b.startMs)
    expect(sorted[0].date).toBe('2026-08-02')
    expect(sorted[1].date).toBe('2026-08-03')
    expect(sorted[1].startMs - sorted[0].startMs).toBe(DAY_MS)
  })

  it("applies the after-midnight offset independently per set's own festival day", () => {
    const [day1Late] = prepareBands([makeBand('01:00', '02:00', '2026-08-02')])
    const [day2Late] = prepareBands([makeBand('01:00', '02:00', '2026-08-03')])
    expect(day2Late.startMs - day1Late.startMs).toBe(DAY_MS)
  })
})

// #768: prepareBands' after-midnight offset must advance the LOCAL CALENDAR
// DATE (via addLocalDays in festivalDays.js), not a fixed 24h/86,400,000ms —
// a local day is 23h/25h across a DST transition, so a flat millisecond add
// lands on the wrong wall-clock time, and sometimes the wrong calendar date,
// for a transition-night after-midnight set. Ground-truth values below were
// derived by running the actual Date arithmetic under TZ=America/Toronto
// (not hand-computed), then cross-checked against the values CodeRabbit
// derived in issue #768.
//
// This repo has no prior convention for pinning a test's timezone, so these
// tests set process.env.TZ directly (scoped to this describe block, restored
// in afterAll) rather than introducing one. That makes the DST assertions
// deterministic regardless of the machine or CI runner's default TZ.
describe('prepareBands — DST-safe after-midnight offset (#768)', () => {
  let originalTz

  beforeAll(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'America/Toronto'
  })

  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('regression: ordinary (non-transition) dates are unchanged by the DST-safe offset', () => {
    const [band] = prepareBands([makeBand('01:00', '02:00', '2026-08-02')])
    const baseStart = Date.parse('2026-08-02T01:00:00')
    const baseEnd = Date.parse('2026-08-02T02:00:00')
    expect(band.startMs).toBe(baseStart + DAY_MS)
    expect(band.endMs).toBe(baseEnd + DAY_MS)
  })

  it('fall back (2026-11-01): a 00:25 after-midnight set lands Nov 2 00:25 EST, not Nov 1 23:25 EST', () => {
    // Toronto falls back 02:00 EDT -> 01:00 EST on 2026-11-01. Verified via
    // `TZ=America/Toronto node`: the broken `+= MS_PER_DAY` implementation
    // produces "Sun Nov 01 2026 23:25:00 GMT-0500" — wrong hour AND wrong
    // calendar day.
    const [band] = prepareBands([makeBand('00:25', '01:10', '2026-11-01')])

    expect(new Date(band.startMs).toString()).toContain('Mon Nov 02 2026 00:25:00 GMT-0500')

    const brokenStartMs = Date.parse('2026-11-01T00:25:00') + DAY_MS
    expect(band.startMs).not.toBe(brokenStartMs)
  })

  it('spring forward (2027-03-14): a 00:25 after-midnight set lands Mar 15 00:25 EDT, not Mar 15 01:25 EDT', () => {
    // Toronto springs forward 02:00 EST -> 03:00 EDT on 2027-03-14. Verified
    // via `TZ=America/Toronto node`: the broken `+= MS_PER_DAY`
    // implementation produces "Mon Mar 15 2027 01:25:00 GMT-0400" — wrong
    // hour (calendar date happens to still be correct for this input).
    const [band] = prepareBands([makeBand('00:25', '01:10', '2027-03-14')])

    expect(new Date(band.startMs).toString()).toContain('Mon Mar 15 2027 00:25:00 GMT-0400')

    const brokenStartMs = Date.parse('2027-03-14T00:25:00') + DAY_MS
    expect(band.startMs).not.toBe(brokenStartMs)
  })

  it('non-existent local time edge: an after-midnight set that lands in the spring-forward gap normalizes forward by the gap size (intentional)', () => {
    // A 02:30 set belonging to the 2027-03-13 evening lineup (hour 2 < the
    // AFTER_MIDNIGHT_THRESHOLD_HOUR of 6) is offset forward one calendar day
    // to 2027-03-14 — but 02:00-02:59 does not exist that day, because
    // Toronto's clocks jump straight from 02:00 to 03:00. `addLocalDays`
    // (via `Date#setDate`) normalizes this forward by the size of the gap
    // (to 03:30 EDT) rather than throwing, the same way the wall clock
    // itself behaves that night. This is pinned as deliberate, not left as
    // incidental engine behavior (#768).
    const [band] = prepareBands([makeBand('02:30', '03:15', '2027-03-13')])

    expect(new Date(band.startMs).toString()).toContain('Sun Mar 14 2027 03:30:00 GMT-0400')
    // Sanity: matches direct construction of the same nonexistent local time.
    expect(band.startMs).toBe(new Date(2027, 2, 14, 2, 30, 0).getTime())
  })

  it('overnight-wrap (endMs < startMs) on the spring-forward transition day itself is also DST-safe', () => {
    // An evening set on the transition day (2027-03-14 23:30) ending just
    // after midnight (00:20, parsed on the same calendar date so it is
    // BEFORE startMs) triggers the `endMs < startMs` wrap at the bottom of
    // prepareBands — a genuine sibling of the after-midnight offset above,
    // using the same addLocalDays helper. Verified via `TZ=America/Toronto
    // node`: the broken `+= MS_PER_DAY` implementation produces "Mon Mar 15
    // 2027 01:20:00 GMT-0400" — one hour late.
    const [band] = prepareBands([makeBand('23:30', '00:20', '2027-03-14')])

    expect(new Date(band.endMs).toString()).toContain('Mon Mar 15 2027 00:20:00 GMT-0400')

    const brokenEndMs = Date.parse('2027-03-14T00:20:00') + DAY_MS
    expect(band.endMs).not.toBe(brokenEndMs)
  })
})
