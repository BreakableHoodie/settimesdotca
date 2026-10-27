import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareBands } from '../bandUtils'
import { getLifecycleLabel } from '../liveLabel'
import { parseTorontoDateTime, torontoDateTimeLocal, torontoWallClockMs } from '../festivalDays'
import { filterPerformancesByTime, isHappeningNow, isHappeningToday } from '../timeFilter'

const ZONES = ['America/Toronto', 'Europe/London', 'America/Vancouver', 'Asia/Tokyo']
const ORIGINAL_TZ = process.env.TZ

describe.each(ZONES)('Toronto clock in %s', zone => {
  beforeEach(() => {
    process.env.TZ = zone
  })

  afterEach(() => {
    delete globalThis.__debugScheduleTime
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  })

  it('resolves Toronto wall-clock times independent of the viewer zone', () => {
    expect(torontoWallClockMs('2026-10-11', '19:00')).toBe(Date.UTC(2026, 9, 11, 23, 0))
    expect(torontoWallClockMs('2027-02-14', '19:00')).toBe(Date.UTC(2027, 1, 15, 0, 0))
  })

  it('resolves repeated and skipped DST wall-clock times to the same instant in every zone', () => {
    // Fall back: 01:30 happens twice; the first (EDT) one wins.
    expect(torontoWallClockMs('2026-11-01', '01:30')).toBe(Date.UTC(2026, 10, 1, 5, 30))
    // Spring forward: 02:30 does not exist; it moves forward to 03:30 EDT.
    expect(torontoWallClockMs('2027-03-14', '02:30')).toBe(Date.UTC(2027, 2, 14, 7, 30))
  })

  it('round-trips the debug clock input as Toronto time', () => {
    // It once wrote Toronto time and read it back viewer-local, so each edit in
    // London moved the clock five hours.
    const showTime = Date.UTC(2026, 9, 11, 23, 30)
    expect(torontoDateTimeLocal(showTime)).toBe('2026-10-11T19:30')
    expect(parseTorontoDateTime(torontoDateTimeLocal(showTime))).toBe(showTime)
    expect(parseTorontoDateTime('2026-10-11T23:30:00.000Z')).toBe(showTime)
  })

  it('prepares after-midnight sets using Toronto calendar dates', () => {
    const [evening, afterMidnight] = prepareBands([
      { date: '2026-10-11', startTime: '23:00', endTime: '23:30' },
      { date: '2026-10-11', startTime: '00:30', endTime: '01:00' },
    ])
    expect(evening.startMs).toBe(Date.UTC(2026, 9, 12, 3, 0))
    expect(afterMidnight.startMs).toBe(Date.UTC(2026, 9, 12, 4, 30))
  })

  it('keeps the lifecycle label on the Toronto event day', () => {
    expect(getLifecycleLabel('2026-10-11', Date.UTC(2026, 9, 11, 23, 30), [])).toEqual(
      expect.objectContaining({ label: 'Live Tonight' })
    )
  })

  it('moves "today" at 06:00 Toronto even though the windows are cached per minute', () => {
    // A Saturday 23:00 set. At 05:59 Sunday it is still that festival night;
    // at 06:00 Sunday a new festival day has begun.
    const set = { startMs: torontoWallClockMs('2026-10-10', '23:00') }
    globalThis.__debugScheduleTime = torontoWallClockMs('2026-10-11', '05:59')
    expect(isHappeningToday(set)).toBe(true)
    globalThis.__debugScheduleTime = torontoWallClockMs('2026-10-11', '06:00')
    expect(isHappeningToday(set)).toBe(false)
    globalThis.__debugScheduleTime = torontoWallClockMs('2026-10-11', '05:59')
    expect(isHappeningToday(set)).toBe(true)
  })

  it('keeps time-filter today and live-now in agreement', () => {
    const now = Date.UTC(2026, 9, 11, 23, 30)
    globalThis.__debugScheduleTime = now
    const performance = {
      startMs: torontoWallClockMs('2026-10-11', '19:00'),
      endMs: torontoWallClockMs('2026-10-11', '20:00'),
    }
    expect(filterPerformancesByTime([performance], 'today')).toEqual([performance])
    expect(isHappeningNow(performance)).toBe(true)
  })
})
