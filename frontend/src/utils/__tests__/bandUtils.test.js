import { describe, it, expect } from 'vitest'
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
