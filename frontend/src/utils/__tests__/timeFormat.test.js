import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { formatPerformanceDayLabel } from '../timeFormat'

// ---------------------------------------------------------------------------
// #739 — a band playing day 2+ of a multi-day event must show a "(Day N)"
// label next to its OWN performance date, not the event's start date. This
// is gated on the event actually being multi-day (event_end_date non-null) —
// day labels on a single-day event are a standing convention violation
// (#540/#541).
// ---------------------------------------------------------------------------
describe('formatPerformanceDayLabel (#739)', () => {
  test('single-day event: no Day N label, even when performance_date is set', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-08',
      event_date: '2026-08-08',
      event_end_date: null,
    })
    expect(label).toBe('Sat, Aug 8')
  })

  test('multi-day event, day 1 (performance_date equals event start): "(Day 1)"', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-07',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })
    expect(label).toBe('Fri, Aug 7 (Day 1)')
  })

  test('multi-day event, day 2: "(Day 2)" — the exact ALL/Buddies Fest 2 production case', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-08',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })
    expect(label).toBe('Sat, Aug 8 (Day 2)')
  })

  test('multi-day event, day 3', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-09',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })
    expect(label).toBe('Sun, Aug 9 (Day 3)')
  })

  test('multi-day event, NULL performance_date (the #543 day-1 convention) inherits event_date and shows Day 1', () => {
    const label = formatPerformanceDayLabel({
      performance_date: null,
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })
    expect(label).toBe('Fri, Aug 7 (Day 1)')
  })

  // The after-midnight interaction (#739): performance_date already stores
  // the EVENING a set belongs to, so a 00:35 set stored under day 1 must
  // stay "(Day 1)" — the 6AM after-midnight threshold must NOT be applied a
  // second time on top of performance_date. This function takes no
  // start_time input at all, so an implementation that reached for
  // AFTER_MIDNIGHT_THRESHOLD_HOUR here would be adding a parameter/behavior
  // that doesn't belong — asserting the plain day-1 case is exactly what
  // catches a wrongly-reintroduced offset if start_time were later wired in.
  test('a 00:35 set stored under performance_date=day 1 stays "(Day 1)", not shifted to Day 2', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-07',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
      start_time: '00:35',
    })
    expect(label).toBe('Fri, Aug 7 (Day 1)')
  })

  test('multi-day event with malformed event_date falls back to the plain date label without crashing', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-08',
      event_date: 'not-a-date',
      event_end_date: '2026-08-09',
    })
    expect(label).toBe('Sat, Aug 8')
  })

  test('returns null when no usable date is present', () => {
    expect(formatPerformanceDayLabel({ performance_date: null, event_date: null, event_end_date: null })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// #739 follow-ups. Both are cases where the first implementation was WRONG in
// a way the original tests could not see:
//
//  1. Dropping the year renders a 2022 set as "Sun, May 22" — the one piece of
//     information that places an archived performance in time is gone.
//  2. Gating "(Day N)" on `event_end_date` being merely non-null treats an
//     event stored with end_date EQUAL to date as multi-day, so a single-day
//     event renders a redundant "(Day 1)" (#540/#541).
//
// The clock is pinned: deriving "current year" from the wall clock would make
// the first pair of tests silently invert on 2027-01-01.
// ---------------------------------------------------------------------------
describe('formatPerformanceDayLabel — year and single-day gating (#739)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3)) // 2026-08-03, local midnight
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('current-year performance omits the year', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-08',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })
    expect(label).toBe('Sat, Aug 8 (Day 2)')
  })

  test('prior-year performance keeps its year', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2022-05-22',
      event_date: '2022-05-22',
      event_end_date: null,
    })
    expect(label).toBe('Sun, May 22, 2022')
  })

  test('future-year performance keeps its year', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2027-08-08',
      event_date: '2027-08-07',
      event_end_date: '2027-08-09',
    })
    expect(label).toBe('Sun, Aug 8, 2027 (Day 2)')
  })

  test('event_end_date EQUAL to event_date is single-day: no Day label', () => {
    const label = formatPerformanceDayLabel({
      performance_date: '2026-08-08',
      event_date: '2026-08-08',
      event_end_date: '2026-08-08',
    })
    expect(label).toBe('Sat, Aug 8')
  })
})
