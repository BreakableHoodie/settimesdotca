import { describe, it, expect, afterEach } from 'vitest'
import {
  isStartingSoon,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  isHappeningToday,
  isHappeningThisWeek,
  getTimeDescription,
} from '../timeFilter.js'

const NOW = 1000000000000 // fixed timestamp, 2001-09-08T21:46:40Z

describe('isStartingSoon', () => {
  it('returns false when startMs is 0', () => {
    expect(isStartingSoon({ startMs: 0 }, NOW)).toBe(false)
  })

  it('returns false when startMs is undefined', () => {
    expect(isStartingSoon({ startMs: undefined }, NOW)).toBe(false)
  })

  it('returns false when start is already past (1 ms ago)', () => {
    expect(isStartingSoon({ startMs: NOW - 1 }, NOW)).toBe(false)
  })

  it('returns false when start is more than 30 min away (31 min)', () => {
    expect(isStartingSoon({ startMs: NOW + 31 * 60000 }, NOW)).toBe(false)
  })

  it('returns false exactly at 30 min + 1 ms boundary', () => {
    expect(isStartingSoon({ startMs: NOW + 30 * 60000 + 1 }, NOW)).toBe(false)
  })

  it('returns true when exactly 30 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 30 * 60000 }, NOW)).toBe(true)
  })

  it('returns true when 29 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 29 * 60000 }, NOW)).toBe(true)
  })

  it('returns true when 1 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 1 * 60000 }, NOW)).toBe(true)
  })

  it('respects custom thresholdMinutes', () => {
    expect(isStartingSoon({ startMs: NOW + 10 * 60000 }, NOW, 5)).toBe(false)
    expect(isStartingSoon({ startMs: NOW + 4 * 60000 }, NOW, 5)).toBe(true)
  })
})

// Fixture dates below use the local `new Date(y, m, d, h)` constructor
// (never `new Date('YYYY-MM-DD')`, per repo convention) so getDay()/getHours()
// reflect the intended local wall-clock time regardless of test-runner TZ.
//
// Confirmed day-of-week for the fixtures used below:
//   Fri Jul 31 2026 = 5, Sat Aug 01 2026 = 6, Sun Aug 02 2026 = 0,
//   Mon Aug 03 2026 = 1, Mon Jul 27 2026 = 1 (one week before Aug 3).

describe('festival-day boundary — getStartOfDay/getEndOfDay (#542)', () => {
  it('getStartOfDay shifts back a calendar day for times before the 6 AM threshold', () => {
    // 1 AM Sunday is still part of Saturday's festival day.
    const oneAmSunday = new Date(2026, 7, 2, 1, 0, 0)
    const start = getStartOfDay(oneAmSunday)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7) // August
    expect(start.getDate()).toBe(1) // shifted back to Saturday
    expect(start.getHours()).toBe(6)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it('getStartOfDay does not shift exactly at the 6 AM threshold', () => {
    const sixAmSunday = new Date(2026, 7, 2, 6, 0, 0)
    const start = getStartOfDay(sixAmSunday)
    expect(start.getDate()).toBe(2) // stays on Sunday — 6 AM belongs to its own day
    expect(start.getHours()).toBe(6)
  })

  it('getStartOfDay does not shift for an ordinary evening time', () => {
    const eightPmSaturday = new Date(2026, 7, 1, 20, 0, 0)
    const start = getStartOfDay(eightPmSaturday)
    expect(start.getDate()).toBe(1) // Saturday, unchanged
    expect(start.getHours()).toBe(6)
  })

  it("getEndOfDay is 1 ms before the next festival day's 6 AM boundary", () => {
    const eightPmSaturday = new Date(2026, 7, 1, 20, 0, 0)
    const end = getEndOfDay(eightPmSaturday)
    expect(end.getMonth()).toBe(7)
    expect(end.getDate()).toBe(2) // early hours of Sunday
    expect(end.getHours()).toBe(5)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })

  it("a single-day event's window is otherwise unchanged: any evening time yields the same day window", () => {
    const noon = getStartOfDay(new Date(2026, 7, 1, 12, 0, 0))
    const evening = getStartOfDay(new Date(2026, 7, 1, 22, 0, 0))
    expect(noon.getTime()).toBe(evening.getTime())
  })
})

describe('isHappeningToday across the festival-day boundary (#542)', () => {
  // A Saturday-evening show (8 PM) and an after-midnight set that started at
  // 1 AM Sunday but belongs to the SAME (Saturday) festival day — mirroring
  // prepareBands()'s +1-day offset for sub-6AM starts, its real startMs
  // timestamp already reflects the shift (see bandUtils.js).
  const eveningPerformance = { startMs: new Date(2026, 7, 1, 20, 0, 0).getTime() }
  const afterMidnightPerformance = { startMs: new Date(2026, 7, 2, 1, 0, 0).getTime() }

  afterEach(() => {
    delete globalThis.__debugScheduleTime
  })

  it.each([
    ['00:00', new Date(2026, 7, 2, 0, 0, 0)],
    ['01:00', new Date(2026, 7, 2, 1, 0, 0)],
    ['05:59', new Date(2026, 7, 2, 5, 59, 0)],
  ])('at %s (still within the previous festival evening), both sets are "Today"', (_label, clock) => {
    globalThis.__debugScheduleTime = clock
    expect(isHappeningToday(eveningPerformance)).toBe(true)
    expect(isHappeningToday(afterMidnightPerformance)).toBe(true)
  })

  it.each([
    ['06:00', new Date(2026, 7, 2, 6, 0, 0)],
    ['23:59', new Date(2026, 7, 2, 23, 59, 0)],
  ])(
    'at %s (the new festival day has started), the previous evening\'s sets are no longer "Today"',
    (_label, clock) => {
      globalThis.__debugScheduleTime = clock
      expect(isHappeningToday(eveningPerformance)).toBe(false)
      expect(isHappeningToday(afterMidnightPerformance)).toBe(false)
    }
  )
})

describe('week boundary at the 1 AM Monday edge (#542, #550 festival-day convention)', () => {
  afterEach(() => {
    delete globalThis.__debugScheduleTime
  })

  it('getStartOfWeek/getEndOfWeek treat 1 AM Monday as still belonging to the previous (Sunday) festival day', () => {
    // Monday, Aug 3 2026, 1 AM — festival-day-wise this is Sunday Aug 2's
    // after-midnight tail, so "this week" must be the week that ENDS with
    // that Sunday (Mon Jul 27 - Sun Aug 2), not the week starting today.
    // Getting this wrong (using the raw calendar day-of-week) would return
    // the wrong week's Monday — an off-by-one at exactly this boundary.
    const mondayOneAm = new Date(2026, 7, 3, 1, 0, 0)
    const start = getStartOfWeek(mondayOneAm)
    const end = getEndOfWeek(mondayOneAm)

    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(6) // July
    expect(start.getDate()).toBe(27) // Monday, Jul 27
    expect(start.getHours()).toBe(6)

    expect(end.getMonth()).toBe(7) // August
    expect(end.getDate()).toBe(3) // early hours of the following Monday
    expect(end.getHours()).toBe(5)
    expect(end.getMinutes()).toBe(59)
  })

  it('an ordinary weekday (non-boundary) resolves to the same week', () => {
    const wednesdayAfternoon = new Date(2026, 6, 29, 14, 0, 0) // Wed Jul 29, 2 PM
    const start = getStartOfWeek(wednesdayAfternoon)
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(27) // same Monday as the 1 AM Monday fixture
    expect(start.getHours()).toBe(6)
  })

  it('isHappeningThisWeek includes a Sunday-evening after-midnight set when checked at 1 AM Monday', () => {
    // The Sunday-night show's real timestamp is 1 AM Monday (after-midnight
    // offset) — the same instant "now" is fixed to below. Still this week.
    globalThis.__debugScheduleTime = new Date(2026, 7, 3, 1, 0, 0)
    const sundayNightSet = { startMs: new Date(2026, 7, 3, 1, 0, 0).getTime() }
    expect(isHappeningThisWeek(sundayNightSet)).toBe(true)
  })

  it('isHappeningThisWeek excludes a Monday-evening set (the following festival day) when checked at 1 AM Monday', () => {
    globalThis.__debugScheduleTime = new Date(2026, 7, 3, 1, 0, 0)
    const mondayEveningSet = { startMs: new Date(2026, 7, 3, 20, 0, 0).getTime() } // Mon 8 PM
    expect(isHappeningThisWeek(mondayEveningSet)).toBe(false)
  })
})

describe('getTimeDescription never names a weekday (#681)', () => {
  // #681: formatFestivalDate already dropped weekday names for day
  // dividers/headers because an after-midnight set's real (offset) timestamp
  // has already rolled over to the next calendar day — a fan sees their
  // phone say "Monday" for a set that belongs to Sunday night's lineup. PR
  // #684 fixed formatFestivalDate but missed this function, which every set
  // card's time label goes through (BandCard.jsx). Same bug, same fix: no
  // weekday name, ever, in the "this week"/"next week" branches.
  afterEach(() => {
    delete globalThis.__debugScheduleTime
  })

  it('does not name a weekday for a this-week, after-midnight set (the exact #681 reproduction)', () => {
    // Sunday Aug 2's after-midnight tail — real timestamp is Monday Aug 3,
    // 12:15 AM (prepareBands' +1-day offset). Checked from earlier in the
    // same festival week (Wed Jul 29), well before "today"/"now" apply, so
    // this exercises the isHappeningThisWeek branch — the one that renders
    // in production for the days leading up to the event.
    globalThis.__debugScheduleTime = new Date(2026, 6, 29, 14, 0, 0) // Wed Jul 29, 2 PM
    const start = new Date(2026, 7, 3, 0, 15, 0) // "Mon" 12:15 AM
    const afterMidnightSundayNightSet = { startMs: start.getTime() }
    // Exact equality, not a weekday-negative regex: the this-week branch is the
    // ONLY one returning a bare time, so this pins the branch as well as the
    // absence of a weekday. A negative regex would also pass on "Today at
    // 12:15 AM" — i.e. on the wrong branch having run. The expected time is
    // derived with the same options the implementation uses, so the assertion
    // stays locale- and timezone-independent in CI.
    const expectedTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    expect(getTimeDescription(afterMidnightSundayNightSet)).toBe(expectedTime)
  })

  it('does not name a weekday for a next-week performance', () => {
    globalThis.__debugScheduleTime = new Date(2026, 6, 29, 14, 0, 0) // Wed Jul 29, 2 PM
    const start = new Date(2026, 7, 5, 20, 0, 0) // Wed Aug 5, 8 PM
    const nextWeekSet = { startMs: start.getTime() }
    const expectedTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    expect(getTimeDescription(nextWeekSet)).toBe(`Next week at ${expectedTime}`)
  })
})

describe('getTimeDescription date fallback renders the festival day (#689)', () => {
  // #689 Finding 1: the >2-weeks fallback derived the date from the raw
  // (post-prepareBands +1-day-offset) startMs, so an after-midnight set
  // rendered the NEXT calendar day — "Aug 8" for a set whose festival day is
  // Aug 7 — disagreeing with DayDivider for the same set. The this-week /
  // next-week branches render time only, which is why this only ever showed
  // for sets viewed more than two weeks out.
  //
  // Any test for this branch MUST pin the clock: left on the real clock the
  // set falls inside the two-week window, the fallback never runs, and the
  // assertion passes vacuously (#689 — the bug was concealed by the date
  // until a pinned-clock test exposed it).
  afterEach(() => {
    delete globalThis.__debugScheduleTime
  })

  it('labels an after-midnight set with its festival day, not the +1-offset calendar day', () => {
    // The real Where's Shane? set at Buddies Fest 2: performance_date
    // 2026-08-07, start_time 00:25. prepareBands offsets startMs +1 day, so
    // the raw Date reads Aug 8 00:25; the festival day — what DayDivider
    // renders — is Aug 7.
    globalThis.__debugScheduleTime = new Date(2026, 6, 13, 14, 0, 0) // Mon Jul 13, 2 PM — beyond next week
    const offsetStart = new Date(2026, 7, 8, 0, 25, 0) // real startMs after the +1-day offset
    const afterMidnightSet = { startMs: offsetStart.getTime() }

    // Expected values derived with the same options the implementation uses,
    // so the assertions stay locale- and timezone-independent in CI (same
    // approach as the #681 tests above).
    const expectedDate = new Date(2026, 7, 7, 0, 25, 0).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })
    const expectedTime = offsetStart.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    expect(getTimeDescription(afterMidnightSet)).toBe(`${expectedDate} ${expectedTime}`)
  })

  it("leaves an ordinary evening set's date unchanged in the fallback", () => {
    // Guards against over-correcting: only sub-6AM sets belong to the
    // previous festival day, so a normal evening set must keep its own date.
    globalThis.__debugScheduleTime = new Date(2026, 6, 13, 14, 0, 0) // Mon Jul 13, 2 PM
    const start = new Date(2026, 7, 7, 20, 0, 0) // Aug 7, 8 PM — no offset
    const eveningSet = { startMs: start.getTime() }
    const expectedDate = start.toLocaleDateString([], { month: 'short', day: 'numeric' })
    const expectedTime = start.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    expect(getTimeDescription(eveningSet)).toBe(`${expectedDate} ${expectedTime}`)
  })
})
