import { describe, expect, it } from 'vitest'
import { adjustForMidnight, detectConflicts, parseTimeToMinutes, sortBandsByStart } from '../timeUtils'

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
