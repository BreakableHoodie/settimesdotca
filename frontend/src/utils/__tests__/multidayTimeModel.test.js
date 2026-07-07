import { describe, it, expect } from 'vitest'
import { prepareBands } from '../bandUtils'
import { groupByTime } from '../../components/ScheduleView'
import { detectConflicts } from '../../admin/utils/timeUtils'

// Collision fixture for #538 (highest-risk piece of the multi-day epic, #543).
//
// A 2-day event where BOTH nights have an 8 PM evening set AND a 1 AM
// after-midnight set. Before this change:
//   - groupByTime grouped by bare clock time, so the two 20:00 sets (and the
//     two 01:00 sets) collapsed into one bucket despite being different
//     festival days.
//   - detectConflicts had no notion of "day" at all, so same-venue,
//     same-clock-time sets on different festival days were flagged as exact
//     conflicts (identical start_time/end_time).
//
// This file drives the real prepareBands / groupByTime / detectConflicts
// functions directly against that fixture.

const DAY_MS = 24 * 60 * 60 * 1000
const DAY1 = '2026-08-02'
const DAY2 = '2026-08-03'

const makeScheduleBand = (id, date, startTime, endTime, venue = 'Main Stage') => ({
  id,
  name: `Band ${id}`,
  date,
  startTime,
  endTime,
  venue,
})

// Day 1 (2026-08-02) 20:00 — evening set
const day1Evening = makeScheduleBand('day1-evening', DAY1, '20:00', '23:00')
// Day 1 (2026-08-02) 01:00 — after-midnight set of night 1 (stores Day 1's date)
const day1Late = makeScheduleBand('day1-late', DAY1, '01:00', '02:00')
// Day 2 (2026-08-03) 20:00 — evening set
const day2Evening = makeScheduleBand('day2-evening', DAY2, '20:00', '23:00')
// Day 2 (2026-08-03) 01:00 — after-midnight set of night 2 (stores Day 2's date)
const day2Late = makeScheduleBand('day2-late', DAY2, '01:00', '02:00')

describe('multi-day collision fixture (#538) — prepareBands', () => {
  const prepared = prepareBands([day1Evening, day1Late, day2Evening, day2Late])
  const byId = Object.fromEntries(prepared.map(b => [b.id, b]))

  it('orders the four sort timestamps strictly: Day1-20:00 < Day1-01:00 < Day2-20:00 < Day2-01:00', () => {
    expect(byId['day1-evening'].startMs).toBeLessThan(byId['day1-late'].startMs)
    expect(byId['day1-late'].startMs).toBeLessThan(byId['day2-evening'].startMs)
    expect(byId['day2-evening'].startMs).toBeLessThan(byId['day2-late'].startMs)
  })

  it('the two 20:00 sets are exactly 24h apart', () => {
    expect(byId['day2-evening'].startMs - byId['day1-evening'].startMs).toBe(DAY_MS)
  })

  it('the two 01:00 after-midnight sets are exactly 24h apart', () => {
    expect(byId['day2-late'].startMs - byId['day1-late'].startMs).toBe(DAY_MS)
  })

  it("each 01:00 set lands after its own night's evening set via the after-midnight offset", () => {
    expect(byId['day1-late'].startMs).toBeGreaterThan(byId['day1-evening'].startMs)
    expect(byId['day2-late'].startMs).toBeGreaterThan(byId['day2-evening'].startMs)
  })
})

describe('multi-day collision fixture (#538) — groupByTime', () => {
  const prepared = prepareBands([day1Evening, day1Late, day2Evening, day2Late])
  const groups = groupByTime(prepared)

  it('keeps the two 20:00 sets in SEPARATE groups (does not collapse same-clock-time, different-day sets)', () => {
    const groupsAt2000 = groups.filter(g => g.time === '20:00')
    expect(groupsAt2000).toHaveLength(2)
    expect(groupsAt2000[0].bands).toHaveLength(1)
    expect(groupsAt2000[1].bands).toHaveLength(1)
    const ids = groupsAt2000.flatMap(g => g.bands.map(b => b.id))
    expect(ids.sort()).toEqual(['day1-evening', 'day2-evening'])
  })

  it('keeps the two 01:00 after-midnight sets in SEPARATE groups', () => {
    const groupsAt0100 = groups.filter(g => g.time === '01:00')
    expect(groupsAt0100).toHaveLength(2)
    expect(groupsAt0100[0].bands).toHaveLength(1)
    expect(groupsAt0100[1].bands).toHaveLength(1)
    const ids = groupsAt0100.flatMap(g => g.bands.map(b => b.id))
    expect(ids.sort()).toEqual(['day1-late', 'day2-late'])
  })

  it('carries the festival day on each group so callers can build a unique key', () => {
    const groupsAt2000 = groups.filter(g => g.time === '20:00')
    expect(groupsAt2000.map(g => g.date).sort()).toEqual([DAY1, DAY2])
  })
})

describe('multi-day collision fixture (#538) — detectConflicts', () => {
  const EVENT_ID = 1
  const VENUE_ID = 42
  const perf = (id, date, start, end) => ({
    id,
    name: `Band ${id}`,
    event_id: EVENT_ID,
    venue_id: VENUE_ID,
    start_time: start,
    end_time: end,
    performance_date: date,
  })

  const day1EveningPerf = perf(1, DAY1, '20:00', '23:00')
  const day2EveningPerf = perf(2, DAY2, '20:00', '23:00')
  const day1LatePerf = perf(3, DAY1, '01:00', '02:00')
  const day2LatePerf = perf(4, DAY2, '01:00', '02:00')
  const allPerfs = [day1EveningPerf, day2EveningPerf, day1LatePerf, day2LatePerf]

  it('does NOT flag same-clock-time, same-venue sets on different festival days as a conflict', () => {
    // Without day-scoping these are identical start_time/end_time -> would be
    // classified as an exact "conflict", not merely an "overlap".
    const result = detectConflicts(day1EveningPerf, allPerfs)
    expect(result.conflicts).not.toContain('Band 2')
    expect(result.overlaps).not.toContain('Band 2')
  })

  it('does NOT flag the two after-midnight sets (different festival days) as a conflict', () => {
    const result = detectConflicts(day1LatePerf, allPerfs)
    expect(result.conflicts).not.toContain('Band 4')
    expect(result.overlaps).not.toContain('Band 4')
  })

  it('still flags a genuine SAME-day overlap as an overlap', () => {
    const overlappingSameDay = perf(5, DAY1, '20:30', '21:30') // overlaps day1EveningPerf, same festival day
    const result = detectConflicts(day1EveningPerf, [...allPerfs, overlappingSameDay])
    expect(result.overlaps).toContain('Band 5')
  })

  it('still flags a genuine SAME-day exact conflict as a conflict', () => {
    const exactSameDay = perf(6, DAY1, '20:00', '23:00') // identical times, same festival day
    const result = detectConflicts(day1EveningPerf, [...allPerfs, exactSameDay])
    expect(result.conflicts).toContain('Band 6')
  })
})

describe('single-day invariant — byte-identical when every set shares one date (#538, #543)', () => {
  it('groupByTime still collapses same-clock-time sets from a single-day event into ONE group', () => {
    const bands = prepareBands([
      makeScheduleBand('a', DAY1, '20:00', '23:00', 'Venue A'),
      makeScheduleBand('b', DAY1, '20:00', '22:00', 'Venue B'),
    ])
    const groups = groupByTime(bands)
    const groupsAt2000 = groups.filter(g => g.time === '20:00')
    expect(groupsAt2000).toHaveLength(1)
    expect(groupsAt2000[0].bands).toHaveLength(2)
  })

  it('detectConflicts still flags an identical-time match as a conflict when performance_date is absent everywhere', () => {
    const perfA = { id: 1, name: 'A', event_id: 1, venue_id: 1, start_time: '20:00', end_time: '23:00' }
    const perfB = { id: 2, name: 'B', event_id: 1, venue_id: 1, start_time: '20:00', end_time: '23:00' }
    const result = detectConflicts(perfA, [perfA, perfB])
    expect(result.conflicts).toEqual(['B'])
    expect(result.overlaps).toHaveLength(0)
  })

  it('prepareBands is unaffected when every set shares one date (still applies the plain after-midnight offset)', () => {
    const [band] = prepareBands([makeScheduleBand('x', DAY1, '01:00', '02:00')])
    expect(band.startMs).toBe(Date.parse(`${DAY1}T01:00:00`) + DAY_MS)
  })
})
