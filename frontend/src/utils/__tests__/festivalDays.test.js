import { describe, expect, it } from 'vitest'
import {
  dayNumberByDate,
  dayNumberMapFromDays,
  formatFestivalDate,
  isMultiDay,
  orderedFestivalDays,
  resolveActiveFestivalDay,
} from '../festivalDays'

describe('formatFestivalDate', () => {
  it('formats the short style as "Aug 2" (no weekday, #681)', () => {
    expect(formatFestivalDate('2026-08-02', 'short')).toBe('Aug 2')
  })

  it('formats the long style as "August 2" (no weekday, #681)', () => {
    expect(formatFestivalDate('2026-08-02', 'long')).toBe('August 2')
  })

  it('defaults to the long style when no style is passed', () => {
    expect(formatFestivalDate('2026-08-02')).toBe('August 2')
  })

  it('does not drift a day near a month boundary (short style)', () => {
    // July 31 2026 is a Friday; a UTC-parsing bug (`new Date('2026-07-31')`) would
    // render as "Jul 30" or "Jul 31" depending on timezone offset direction —
    // the local-timezone numeric constructor must keep this pinned to Jul 31.
    expect(formatFestivalDate('2026-07-31', 'short')).toBe('Jul 31')
  })

  it('does not drift a day near a month boundary (long style)', () => {
    expect(formatFestivalDate('2026-08-01', 'long')).toBe('August 1')
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

describe('dayNumberMapFromDays', () => {
  it('assigns 1..N in the given order, trusting the caller-supplied list', () => {
    const map = dayNumberMapFromDays(['2026-08-02', '2026-08-03', '2026-08-04'])
    expect(map.get('2026-08-02')).toBe(1)
    expect(map.get('2026-08-03')).toBe(2)
    expect(map.get('2026-08-04')).toBe(3)
  })

  it('numbers a date correctly even when it is the only one present in a caller-supplied subset day list', () => {
    // Simulates MySchedule deriving from a fan's Day-2-only selection while
    // still being told the full event's days start on 2026-08-02 (#542 PR-3).
    const map = dayNumberMapFromDays(['2026-08-02', '2026-08-03'])
    expect(map.get('2026-08-03')).toBe(2)
  })

  it('returns an empty map for an empty list', () => {
    expect(dayNumberMapFromDays([]).size).toBe(0)
  })
})

describe('resolveActiveFestivalDay', () => {
  const days = ['2026-08-07', '2026-08-08', '2026-08-09']

  it('returns null when there are no festival days', () => {
    expect(resolveActiveFestivalDay({ days: [], dayParam: '1', todayStr: '2026-08-07' })).toBeNull()
  })

  it('honors a valid ?day=N param over the smart default', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: '3', todayStr: '2026-08-07' })).toBe(3)
  })

  it('falls back to the smart default for a non-numeric dayParam', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: 'abc', todayStr: '2026-08-09' })).toBe(3)
  })

  it('falls back to the smart default for a dayParam of 0', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: '0', todayStr: '2026-08-07' })).toBe(1)
  })

  it('falls back to the smart default for a dayParam beyond the day count', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: '99', todayStr: '2026-08-07' })).toBe(1)
  })

  it('falls back to the smart default for a dayParam with trailing garbage', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: '2abc', todayStr: '2026-08-07' })).toBe(1)
  })

  it('falls back to the smart default when dayParam is missing', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: null, todayStr: '2026-08-07' })).toBe(1)
  })

  it('defaults to today’s festival day when in progress (within [startDate, endDate])', () => {
    expect(
      resolveActiveFestivalDay({
        days,
        dayParam: null,
        todayStr: '2026-08-08',
        startDate: '2026-08-07',
        endDate: '2026-08-09',
      })
    ).toBe(2)
  })

  it('defaults to day 1 when today is before the event start, even if bounds are given', () => {
    expect(
      resolveActiveFestivalDay({
        days,
        dayParam: null,
        todayStr: '2026-08-01',
        startDate: '2026-08-07',
        endDate: '2026-08-09',
      })
    ).toBe(1)
  })

  it('defaults to day 1 when today is after the event ends', () => {
    expect(
      resolveActiveFestivalDay({
        days,
        dayParam: null,
        todayStr: '2026-08-15',
        startDate: '2026-08-07',
        endDate: '2026-08-09',
      })
    ).toBe(1)
  })

  it('defaults to day 1 when today is in progress but is not itself a festival day (dark day)', () => {
    expect(
      resolveActiveFestivalDay({
        days: ['2026-08-07', '2026-08-09'],
        dayParam: null,
        todayStr: '2026-08-08',
        startDate: '2026-08-07',
        endDate: '2026-08-09',
      })
    ).toBe(1)
  })

  it('without startDate/endDate, approximates "in progress" as direct membership in days', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: null, todayStr: '2026-08-09' })).toBe(3)
  })

  it('without startDate/endDate, defaults to day 1 when today matches no festival day', () => {
    expect(resolveActiveFestivalDay({ days, dayParam: null, todayStr: '2026-05-01' })).toBe(1)
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
