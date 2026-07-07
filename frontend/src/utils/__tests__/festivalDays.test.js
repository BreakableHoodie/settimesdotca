import { describe, expect, it } from 'vitest'
import { dayNumberByDate, formatFestivalDate, isMultiDay, orderedFestivalDays } from '../festivalDays'

describe('formatFestivalDate', () => {
  it('formats the short style as "Sun Aug 2" (no comma)', () => {
    expect(formatFestivalDate('2026-08-02', 'short')).toBe('Sun Aug 2')
  })

  it('formats the long style as "Sunday, August 2"', () => {
    expect(formatFestivalDate('2026-08-02', 'long')).toBe('Sunday, August 2')
  })

  it('defaults to the long style when no style is passed', () => {
    expect(formatFestivalDate('2026-08-02')).toBe('Sunday, August 2')
  })

  it('does not drift a day near a month boundary (short style)', () => {
    // July 31 2026 is a Friday; a UTC-parsing bug (`new Date('2026-07-31')`) would
    // render as "Thu Jul 30" or "Fri Jul 31" depending on timezone offset direction —
    // the local-timezone numeric constructor must keep this pinned to Jul 31.
    expect(formatFestivalDate('2026-07-31', 'short')).toBe('Fri Jul 31')
  })

  it('does not drift a day near a month boundary (long style)', () => {
    expect(formatFestivalDate('2026-08-01', 'long')).toBe('Saturday, August 1')
  })

  it('returns an empty string for a missing/empty date', () => {
    expect(formatFestivalDate('')).toBe('')
    expect(formatFestivalDate(null)).toBe('')
    expect(formatFestivalDate(undefined)).toBe('')
  })
})

describe('orderedFestivalDays', () => {
  it('returns a single date for a single-day event', () => {
    const items = [{ date: '2026-08-02' }, { date: '2026-08-02' }]
    expect(orderedFestivalDays(items)).toEqual(['2026-08-02'])
  })

  it('returns distinct dates in ascending order for a 2-day event', () => {
    const items = [{ date: '2026-08-03' }, { date: '2026-08-02' }, { date: '2026-08-02' }]
    expect(orderedFestivalDays(items)).toEqual(['2026-08-02', '2026-08-03'])
  })

  it('returns distinct dates in ascending order for a 3-day event', () => {
    const items = [{ date: '2026-08-04' }, { date: '2026-08-02' }, { date: '2026-08-03' }]
    expect(orderedFestivalDays(items)).toEqual(['2026-08-02', '2026-08-03', '2026-08-04'])
  })

  it('ignores null/empty date values', () => {
    const items = [{ date: null }, { date: '' }, { date: '2026-08-02' }, { date: undefined }]
    expect(orderedFestivalDays(items)).toEqual(['2026-08-02'])
  })

  it('returns an empty array for empty/missing input', () => {
    expect(orderedFestivalDays([])).toEqual([])
    expect(orderedFestivalDays(null)).toEqual([])
    expect(orderedFestivalDays(undefined)).toEqual([])
  })
})

describe('dayNumberByDate', () => {
  it('assigns Day 1 for a single-day event', () => {
    const items = [{ date: '2026-08-02' }, { date: '2026-08-02' }]
    const map = dayNumberByDate(items)
    expect(map.get('2026-08-02')).toBe(1)
    expect(map.size).toBe(1)
  })

  it('assigns 1..N in ascending date order for a multi-day event', () => {
    const items = [{ date: '2026-08-03' }, { date: '2026-08-02' }, { date: '2026-08-04' }]
    const map = dayNumberByDate(items)
    expect(map.get('2026-08-02')).toBe(1)
    expect(map.get('2026-08-03')).toBe(2)
    expect(map.get('2026-08-04')).toBe(3)
  })

  it('excludes null/empty dates from the map', () => {
    const items = [{ date: null }, { date: '2026-08-02' }, { date: '' }]
    const map = dayNumberByDate(items)
    expect(map.size).toBe(1)
    expect(map.get('2026-08-02')).toBe(1)
  })
})

describe('isMultiDay', () => {
  it('is false for a single distinct date', () => {
    expect(isMultiDay([{ date: '2026-08-02' }, { date: '2026-08-02' }])).toBe(false)
  })

  it('is false when all dates are null/empty (degenerate single-day case)', () => {
    expect(isMultiDay([{ date: null }, { date: '' }])).toBe(false)
  })

  it('is true for a 2-day span', () => {
    expect(isMultiDay([{ date: '2026-08-02' }, { date: '2026-08-03' }])).toBe(true)
  })

  it('is true for a 3-day span', () => {
    expect(isMultiDay([{ date: '2026-08-02' }, { date: '2026-08-03' }, { date: '2026-08-04' }])).toBe(true)
  })

  it('is false for empty input', () => {
    expect(isMultiDay([])).toBe(false)
  })
})
