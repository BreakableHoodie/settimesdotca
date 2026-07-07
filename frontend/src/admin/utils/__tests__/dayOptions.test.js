import { describe, expect, it } from 'vitest'
import { buildDayOptions, enumerateFestivalDays, isMultiDayEvent } from '../dayOptions'

describe('isMultiDayEvent', () => {
  it('is false for a single-day event (no end_date)', () => {
    expect(isMultiDayEvent({ date: '2026-08-02', end_date: null })).toBe(false)
  })

  it('is false when end_date equals date', () => {
    expect(isMultiDayEvent({ date: '2026-08-02', end_date: '2026-08-02' })).toBe(false)
  })

  it('is true when end_date is after date', () => {
    expect(isMultiDayEvent({ date: '2026-08-02', end_date: '2026-08-03' })).toBe(true)
  })

  it('is false when event is missing entirely', () => {
    expect(isMultiDayEvent(null)).toBe(false)
    expect(isMultiDayEvent(undefined)).toBe(false)
  })
})

describe('enumerateFestivalDays', () => {
  it('returns a single day when endDate is null', () => {
    expect(enumerateFestivalDays('2026-08-02', null)).toEqual(['2026-08-02'])
  })

  it('enumerates a 2-day span inclusive of both ends', () => {
    expect(enumerateFestivalDays('2026-08-02', '2026-08-03')).toEqual(['2026-08-02', '2026-08-03'])
  })

  it('enumerates a 3-day span inclusive of both ends', () => {
    expect(enumerateFestivalDays('2026-08-02', '2026-08-04')).toEqual(['2026-08-02', '2026-08-03', '2026-08-04'])
  })

  it('crosses a month boundary correctly', () => {
    expect(enumerateFestivalDays('2026-07-31', '2026-08-02')).toEqual(['2026-07-31', '2026-08-01', '2026-08-02'])
  })

  it('collapses to a single day when endDate is before startDate (defensive)', () => {
    expect(enumerateFestivalDays('2026-08-02', '2026-08-01')).toEqual(['2026-08-02'])
  })

  it('returns an empty array when startDate is missing', () => {
    expect(enumerateFestivalDays(null, '2026-08-03')).toEqual([])
  })
})

describe('buildDayOptions', () => {
  it('produces correct labels/values for a 2-day span', () => {
    const options = buildDayOptions('2026-08-02', '2026-08-03')
    expect(options).toEqual([
      { value: '2026-08-02', label: 'Day 1 (Sun Aug 2)' },
      { value: '2026-08-03', label: 'Day 2 (Mon Aug 3)' },
    ])
  })

  it('produces correct labels/values for a 3-day span', () => {
    const options = buildDayOptions('2026-08-02', '2026-08-04')
    expect(options).toEqual([
      { value: '2026-08-02', label: 'Day 1 (Sun Aug 2)' },
      { value: '2026-08-03', label: 'Day 2 (Mon Aug 3)' },
      { value: '2026-08-04', label: 'Day 3 (Tue Aug 4)' },
    ])
  })

  it('produces a single Day 1 option for a single-day event', () => {
    const options = buildDayOptions('2026-08-02', null)
    expect(options).toEqual([{ value: '2026-08-02', label: 'Day 1 (Sun Aug 2)' }])
  })

  it('option values round-trip through enumerateFestivalDays', () => {
    const days = enumerateFestivalDays('2026-08-02', '2026-08-04')
    const options = buildDayOptions('2026-08-02', '2026-08-04')
    expect(options.map(o => o.value)).toEqual(days)
  })
})
