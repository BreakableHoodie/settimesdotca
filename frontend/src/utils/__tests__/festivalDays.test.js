import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addLocalDays,
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

// #768: addLocalDays must advance the LOCAL CALENDAR DATE, not a fixed
// 86,400,000ms — a local day is 23h/25h across a DST transition, so a flat
// millisecond add lands on the wrong wall-clock time (and sometimes the
// wrong calendar date). These tests pin process.env.TZ to America/Toronto
// so the DST assertions are deterministic regardless of the machine/CI TZ —
// this repo has no prior TZ-pinning convention for tests, so the pin is
// scoped to this describe block and restored afterward rather than added
// globally to src/test/setup.js.
describe('addLocalDays (#768 — DST-safe day offset)', () => {
  let originalTz

  beforeAll(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'America/Toronto'
  })

  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('is a no-op-equivalent to +24h on an ordinary (non-transition) date — no regression to the 99% case', () => {
    const ms = Date.parse('2026-08-02T01:00:00')
    const DAY_MS = 24 * 60 * 60 * 1000
    expect(addLocalDays(ms, 1)).toBe(ms + DAY_MS)
  })

  it('fall back (2026-11-01): keeps 00:25 wall-clock time and lands on the correct next calendar day', () => {
    // Toronto falls back 02:00 EDT -> 01:00 EST on 2026-11-01. A 00:25 set
    // belonging to the Nov 1 evening lineup must land Nov 2 00:25 EST — the
    // fixed +24h add instead produces Nov 1 23:25 EST (wrong hour AND wrong
    // calendar day; asserted as the "broken" comparison below).
    const startMs = Date.parse('2026-11-01T00:25:00')
    const result = addLocalDays(startMs, 1)

    expect(new Date(result).toString()).toContain('Nov 02 2026 00:25:00')
    expect(new Date(result).toString()).toContain('GMT-0500')

    const broken = startMs + 24 * 60 * 60 * 1000
    expect(result).not.toBe(broken)
  })

  it('spring forward (2027-03-14): keeps 00:25 wall-clock time and lands on the correct next calendar day', () => {
    // Toronto springs forward 02:00 EST -> 03:00 EDT on 2027-03-14. A 00:25 set
    // belonging to the Mar 14 evening lineup must land Mar 15 00:25 EDT — the
    // fixed +24h add instead produces Mar 15 01:25 EDT (wrong hour).
    const startMs = Date.parse('2027-03-14T00:25:00')
    const result = addLocalDays(startMs, 1)

    expect(new Date(result).toString()).toContain('Mar 15 2027 00:25:00')
    expect(new Date(result).toString()).toContain('GMT-0400')

    const broken = startMs + 24 * 60 * 60 * 1000
    expect(result).not.toBe(broken)
  })

  it('non-existent local time edge: stepping into the spring-forward gap normalizes forward by the gap size (intentional)', () => {
    // 2027-03-13 02:30 is an ordinary after-midnight set (belongs to the Mar 13
    // evening lineup, before the transition). Advancing it by one local
    // calendar day lands on 2027-03-14 02:30 — a wall-clock time that never
    // occurs, because Toronto's clocks jump straight from 02:00 to 03:00 that
    // night. setDate() normalizes this forward by the size of the gap (to
    // 03:30 EDT) rather than throwing, matching how the wall clock itself
    // behaves that night. This is deliberately pinned as correct, not left as
    // incidental engine behavior (#768).
    const startMs = Date.parse('2027-03-13T02:30:00')
    const result = addLocalDays(startMs, 1)

    expect(new Date(result).toString()).toContain('Mar 14 2027 03:30:00')
    expect(new Date(result).toString()).toContain('GMT-0400')

    // Sanity: matches direct construction of the same nonexistent local time.
    const direct = new Date(2027, 2, 14, 2, 30, 0)
    expect(result).toBe(direct.getTime())
  })
})
