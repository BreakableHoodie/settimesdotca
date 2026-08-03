import { describe, expect, test } from 'vitest'
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
