import { describe, expect, it } from 'vitest'
import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from '../../../utils/festivalDays'
import {
  adjustForMidnight,
  AFTER_MIDNIGHT_THRESHOLD_MINUTES,
  detectConflicts,
  parseTimeToMinutes,
  resolveFestivalDay,
  sortBandsByStart,
} from '../timeUtils'

// ─── AFTER_MIDNIGHT_THRESHOLD_MINUTES derivation (#550) ─────────────────────

describe('AFTER_MIDNIGHT_THRESHOLD_MINUTES', () => {
  it('derives from the canonical AFTER_MIDNIGHT_THRESHOLD_HOUR (festivalDays.js), never a separate literal', () => {
    expect(AFTER_MIDNIGHT_THRESHOLD_MINUTES).toBe(AFTER_MIDNIGHT_THRESHOLD_HOUR * 60)
  })
})

// ─── sortBandsByStart ────────────────────────────────────────────────────────

describe('sortBandsByStart — after-midnight ordering', () => {
  it('sorts evening bands before after-midnight bands', () => {
    const bands = [
      { id: 1, name: 'Late', start_time: '01:10' },
      { id: 2, name: 'Evening', start_time: '23:40' },
      { id: 3, name: 'Afternoon', start_time: '15:00' },
    ]
    const result = sortBandsByStart(bands)
    expect(result.map(b => b.name)).toEqual(['Afternoon', 'Evening', 'Late'])
  })

  it('sorts midnight-adjacent bands in correct order: 23:40 → 00:10 → 01:10', () => {
    const bands = [
      { id: 1, name: 'C', start_time: '01:10' },
      { id: 2, name: 'A', start_time: '23:40' },
      { id: 3, name: 'B', start_time: '00:10' },
    ]
    const result = sortBandsByStart(bands)
    expect(result.map(b => b.name)).toEqual(['A', 'B', 'C'])
  })

  it('places TBD bands at the end', () => {
    const bands = [
      { id: 1, name: 'TBD', start_time: null },
      { id: 2, name: 'Late', start_time: '01:00' },
      { id: 3, name: 'Evening', start_time: '22:00' },
    ]
    const result = sortBandsByStart(bands)
    expect(result.map(b => b.name)).toEqual(['Evening', 'Late', 'TBD'])
  })

  it('falls back to article-stripped alphabetical order when both bands lack a start time (#587)', () => {
    const bands = [
      { id: 1, name: 'Zebras', start_time: null },
      { id: 2, name: 'The Anti-Queens', start_time: null },
      { id: 3, name: 'Beatles', start_time: null },
    ]
    const result = sortBandsByStart(bands)
    // Raw byte order would be Beatles, The Anti-Queens, Zebras (T before Z).
    // Article-stripped order puts "The Anti-Queens" under A.
    expect(result.map(b => b.name)).toEqual(['The Anti-Queens', 'Beatles', 'Zebras'])
  })

  it('falls back to article-stripped alphabetical order when adjusted start times tie (#587)', () => {
    const bands = [
      { id: 1, name: 'Zebras', start_time: '20:00' },
      { id: 2, name: 'The Anti-Queens', start_time: '20:00' },
      { id: 3, name: 'Beatles', start_time: '20:00' },
    ]
    const result = sortBandsByStart(bands)
    expect(result.map(b => b.name)).toEqual(['The Anti-Queens', 'Beatles', 'Zebras'])
  })

  it('keeps TBD bands at the end when sorting descending (LineupTab inline sort regression)', () => {
    // Simulates the manual sort in LineupTab with direction = -1 (descending).
    // Null times must always go last regardless of sort direction.
    const bands = [
      { id: 1, name: 'TBD', start_time: null },
      { id: 2, name: 'Late', start_time: '01:00' },
      { id: 3, name: 'Evening', start_time: '22:00' },
    ]
    const direction = -1
    const sorted = [...bands].sort((a, b) => {
      const aMin = parseTimeToMinutes(a.start_time)
      const bMin = parseTimeToMinutes(b.start_time)
      if (aMin == null && bMin == null) return 0
      if (aMin == null) return 1
      if (bMin == null) return -1
      const aAdj = adjustForMidnight(aMin)
      const bAdj = adjustForMidnight(bMin)
      return (aAdj - bAdj) * direction
    })
    expect(sorted[sorted.length - 1].name).toBe('TBD')
  })

  it('treats bands before 6 AM as after-midnight (not early morning)', () => {
    const bands = [
      { id: 1, name: 'Dawn', start_time: '05:59' },
      { id: 2, name: 'Morning', start_time: '06:00' },
    ]
    const result = sortBandsByStart(bands)
    // 06:00 is NOT in the after-midnight window, so it sorts first
    expect(result.map(b => b.name)).toEqual(['Morning', 'Dawn'])
  })
})

// ─── detectConflicts ─────────────────────────────────────────────────────────

const EVENT_ID = 1
const VENUE_ID = 42

const band = (id, start, end) => ({
  id,
  name: `Band ${id}`,
  event_id: EVENT_ID,
  venue_id: VENUE_ID,
  start_time: start,
  end_time: end,
})

const noIssues = result => result.overlaps.length === 0 && result.conflicts.length === 0

describe('detectConflicts — zero-duration bands', () => {
  it('does not conflict when start_time equals end_time (was falsely treated as 24h)', () => {
    const zeroDuration = band(1, '22:00', '22:00')
    const other = band(2, '21:00', '23:00')
    expect(noIssues(detectConflicts(zeroDuration, [zeroDuration, other]))).toBe(true)
  })

  it('does not cause others to falsely conflict with a zero-duration band', () => {
    const zeroDuration = band(1, '22:00', '22:00')
    const other = band(2, '21:00', '23:00')
    expect(noIssues(detectConflicts(other, [zeroDuration, other]))).toBe(true)
  })
})

describe('detectConflicts — overlaps vs exact conflicts', () => {
  it('classifies partial time overlap as overlap (not conflict)', () => {
    const nightSet = band(1, '23:30', '00:30')
    const earlySet = band(2, '00:00', '01:00')
    const result1 = detectConflicts(nightSet, [nightSet, earlySet])
    expect(result1.overlaps).toEqual(['Band 2'])
    expect(result1.conflicts).toHaveLength(0)
    const result2 = detectConflicts(earlySet, [nightSet, earlySet])
    expect(result2.overlaps).toEqual(['Band 1'])
    expect(result2.conflicts).toHaveLength(0)
  })

  it('classifies identical start AND end time as conflict (not overlap)', () => {
    const setA = band(1, '21:00', '22:00')
    const setB = band(2, '21:00', '22:00')
    const result = detectConflicts(setA, [setA, setB])
    expect(result.conflicts).toEqual(['Band 2'])
    expect(result.overlaps).toHaveLength(0)
  })

  it('classifies same start but different end as overlap (not conflict)', () => {
    const setA = band(1, '21:00', '22:00')
    const setB = band(2, '21:00', '22:30')
    const result = detectConflicts(setA, [setA, setB])
    expect(result.overlaps).toEqual(['Band 2'])
    expect(result.conflicts).toHaveLength(0)
  })
})

describe('detectConflicts — after-midnight sets', () => {
  it('does not flag non-overlapping after-midnight sets as conflicts', () => {
    const setA = band(1, '23:00', '00:00') // ends exactly at midnight
    const setB = band(2, '00:00', '01:00') // starts exactly at midnight
    // Touching endpoints — strict inequality means no overlap
    expect(noIssues(detectConflicts(setA, [setA, setB]))).toBe(true)
    expect(noIssues(detectConflicts(setB, [setA, setB]))).toBe(true)
  })

  it('does not conflict across different venues', () => {
    const setA = { ...band(1, '23:00', '00:30'), venue_id: 1 }
    const setB = { ...band(2, '23:00', '00:30'), venue_id: 2 }
    expect(noIssues(detectConflicts(setA, [setA, setB]))).toBe(true)
  })

  it('does not conflict across different events', () => {
    const setA = { ...band(1, '23:00', '00:30'), event_id: 1 }
    const setB = { ...band(2, '23:00', '00:30'), event_id: 2 }
    expect(noIssues(detectConflicts(setA, [setA, setB]))).toBe(true)
  })
})

describe('detectConflicts — requires event_id on candidate', () => {
  it('returns empty when candidate is missing event_id (guards against the form bug)', () => {
    const noEventId = { id: 1, name: 'X', venue_id: VENUE_ID, start_time: '22:00', end_time: '23:00' }
    const other = band(2, '22:30', '23:30')
    expect(noIssues(detectConflicts(noEventId, [other]))).toBe(true)
  })
})

// ─── detectConflicts — festival-day scoping (#538) ──────────────────────────

describe('detectConflicts — festival-day scoping (#538)', () => {
  const dayBand = (id, start, end, performanceDate) => ({ ...band(id, start, end), performance_date: performanceDate })

  it('does not conflict across different festival days even with identical clock times', () => {
    const day1 = dayBand(1, '20:00', '23:00', '2026-08-02')
    const day2 = dayBand(2, '20:00', '23:00', '2026-08-03')
    expect(noIssues(detectConflicts(day1, [day1, day2]))).toBe(true)
  })

  it('does not conflict across different festival days for after-midnight sets', () => {
    const day1Late = dayBand(1, '01:00', '02:00', '2026-08-02')
    const day2Late = dayBand(2, '01:00', '02:00', '2026-08-03')
    expect(noIssues(detectConflicts(day1Late, [day1Late, day2Late]))).toBe(true)
  })

  it('still flags a genuine overlap on the same festival day', () => {
    const setA = dayBand(1, '20:00', '22:00', '2026-08-02')
    const setB = dayBand(2, '21:00', '23:00', '2026-08-02')
    const result = detectConflicts(setA, [setA, setB])
    expect(result.overlaps).toEqual(['Band 2'])
    expect(result.conflicts).toHaveLength(0)
  })

  it('still flags a genuine exact conflict on the same festival day', () => {
    const setA = dayBand(1, '20:00', '22:00', '2026-08-02')
    const setB = dayBand(2, '20:00', '22:00', '2026-08-02')
    const result = detectConflicts(setA, [setA, setB])
    expect(result.conflicts).toEqual(['Band 2'])
    expect(result.overlaps).toHaveLength(0)
  })

  it('falls back to the supplied event date when performance_date is absent on one side', () => {
    // `explicit` is pinned to Day 2; `implicit` has no performance_date, so it
    // falls back to the eventDate argument (Day 1) — the two are on different
    // festival days and must not conflict despite overlapping clock times.
    const explicit = dayBand(1, '20:00', '22:00', '2026-08-03')
    const implicit = band(2, '20:00', '22:00')
    const result = detectConflicts(explicit, [explicit, implicit], '2026-08-02')
    expect(noIssues(result)).toBe(true)
  })

  it('single-day invariant: with performance_date absent everywhere and no eventDate, behaves exactly as before', () => {
    const setA = band(1, '20:00', '22:00')
    const setB = band(2, '20:00', '22:00')
    const result = detectConflicts(setA, [setA, setB])
    expect(result.conflicts).toEqual(['Band 2'])
    expect(result.overlaps).toHaveLength(0)
  })
})

// ─── resolveFestivalDay (#588) ───────────────────────────────────────────────
// Exported so LineupTab's Day column/sort/filter resolve a performance's
// festival day identically to detectConflicts's day-scoping — covered here
// directly (rather than only indirectly through detectConflicts) since it is
// now a standalone export other modules rely on.

describe('resolveFestivalDay', () => {
  it('returns the performance_date when set', () => {
    expect(resolveFestivalDay({ performance_date: '2026-08-03' }, '2026-08-02')).toBe('2026-08-03')
  })

  it('falls back to the supplied eventDate when performance_date is null', () => {
    expect(resolveFestivalDay({ performance_date: null }, '2026-08-02')).toBe('2026-08-02')
  })

  it('falls back to the supplied eventDate when performance_date is absent entirely', () => {
    expect(resolveFestivalDay({}, '2026-08-02')).toBe('2026-08-02')
  })

  it('returns null when neither performance_date nor eventDate is available', () => {
    expect(resolveFestivalDay({}, null)).toBeNull()
    expect(resolveFestivalDay({}, undefined)).toBeNull()
  })

  it('returns null for a null/undefined performance with no eventDate', () => {
    expect(resolveFestivalDay(null, null)).toBeNull()
    expect(resolveFestivalDay(undefined, undefined)).toBeNull()
  })
})
