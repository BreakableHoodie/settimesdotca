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

describe('detectConflicts — zero-duration bands', () => {
  it('does not conflict when start_time equals end_time (was falsely treated as 24h)', () => {
    const zeroDuration = band(1, '22:00', '22:00')
    const other = band(2, '21:00', '23:00')
    // Zero-duration band should not conflict with anything
    expect(detectConflicts(zeroDuration, [zeroDuration, other])).toHaveLength(0)
  })

  it('does not cause others to falsely conflict with a zero-duration band', () => {
    const zeroDuration = band(1, '22:00', '22:00')
    const other = band(2, '21:00', '23:00')
    expect(detectConflicts(other, [zeroDuration, other])).toHaveLength(0)
  })
})

describe('detectConflicts — after-midnight sets', () => {
  it('detects overlap between a midnight-spanning set and a late-night set', () => {
    const nightSet = band(1, '23:30', '00:30') // spans midnight
    const earlySet = band(2, '00:00', '01:00') // starts after midnight
    // 00:00–00:30 overlap
    expect(detectConflicts(nightSet, [nightSet, earlySet])).toEqual(['Band 2'])
    expect(detectConflicts(earlySet, [nightSet, earlySet])).toEqual(['Band 1'])
  })

  it('does not flag non-overlapping after-midnight sets as conflicts', () => {
    const setA = band(1, '23:00', '00:00') // ends exactly at midnight
    const setB = band(2, '00:00', '01:00') // starts exactly at midnight
    // Touching endpoints — strict inequality means no overlap
    expect(detectConflicts(setA, [setA, setB])).toHaveLength(0)
    expect(detectConflicts(setB, [setA, setB])).toHaveLength(0)
  })

  it('does not conflict across different venues', () => {
    const setA = { ...band(1, '23:00', '00:30'), venue_id: 1 }
    const setB = { ...band(2, '23:00', '00:30'), venue_id: 2 }
    expect(detectConflicts(setA, [setA, setB])).toHaveLength(0)
  })

  it('does not conflict across different events', () => {
    const setA = { ...band(1, '23:00', '00:30'), event_id: 1 }
    const setB = { ...band(2, '23:00', '00:30'), event_id: 2 }
    expect(detectConflicts(setA, [setA, setB])).toHaveLength(0)
  })
})

describe('detectConflicts — requires event_id on candidate', () => {
  it('returns empty when candidate is missing event_id (guards against the form bug)', () => {
    const noEventId = { id: 1, name: 'X', venue_id: VENUE_ID, start_time: '22:00', end_time: '23:00' }
    const other = band(2, '22:30', '23:30')
    expect(detectConflicts(noEventId, [other])).toHaveLength(0)
  })
})
