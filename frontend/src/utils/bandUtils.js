import { AFTER_MIDNIGHT_THRESHOLD_HOUR, addLocalDays } from './festivalDays'

// Times starting before AFTER_MIDNIGHT_THRESHOLD_HOUR are treated as after-midnight sets
// of the event night, so they sort after same-day evening sets rather than appearing at
// the top of the schedule. Canonical definition lives in festivalDays.js (#550).

/**
 * Enriches raw band data with precomputed startMs/endMs timestamps.
 * Handles after-midnight sets by detecting start times before AFTER_MIDNIGHT_THRESHOLD_HOUR
 * and offsetting them by one day so they sort correctly after evening performances.
 *
 * Multi-day support (#538): this already generalizes to N festival days with NO
 * code change, because it keys entirely off each band's own `band.date` (its
 * festival day) rather than a single shared event date. Two sets on different
 * days simply parse to different base timestamps before the after-midnight
 * offset is applied. Confirmed by the collision fixture in
 * `__tests__/multidayTimeModel.test.js` and the regression test below. When
 * every band shares one `date` (today's single-day events, and the NULL
 * `performance_date` degenerate case), this is byte-identical to before.
 */
// Used when a set has a start time but no end time. Matches the iCal feed's
// derived end (functions/api/feeds/ical.js, #1079) so the two surfaces agree.
export const DEFAULT_SET_DURATION_MS = 60 * 60 * 1000

export function prepareBands(list) {
  return list.map(band => {
    let startMs = Date.parse(`${band.date}T${band.startTime}:00`)
    let endMs = Date.parse(`${band.date}T${band.endTime}:00`)

    if (!Number.isNaN(startMs)) {
      const startHour = parseInt(String(band.startTime ?? '').split(':')[0], 10)
      if (Number.isFinite(startHour) && startHour < AFTER_MIDNIGHT_THRESHOLD_HOUR) {
        // Advance the LOCAL CALENDAR DATE, not a fixed 24h — a local day is
        // 23h/25h across a DST transition, so a flat millisecond add lands on
        // the wrong wall-clock time (and sometimes the wrong calendar date)
        // for an after-midnight set on a transition night (#768).
        startMs = addLocalDays(startMs, 1)
        if (!Number.isNaN(endMs)) endMs = addLocalDays(endMs, 1)
      }
    }

    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
      endMs = addLocalDays(endMs, 1)
    }

    // A set with a start but no end (a closing act billed "12:25 - END") is a
    // real, timed set. Leaving endMs at 0 made every consumer treat it as
    // untimed: "upcoming" forever on the schedule, never "playing now" or
    // "up next", dropped from My Route as already finished, and ignored when
    // deciding the night was over. Derive the end as the calendar feed does
    // (#1079): start + 1 hour, never a constant clock time.
    if (!Number.isNaN(startMs) && Number.isNaN(endMs)) {
      endMs = startMs + DEFAULT_SET_DURATION_MS
    }

    return {
      ...band,
      startMs: Number.isNaN(startMs) ? 0 : startMs,
      endMs: Number.isNaN(endMs) ? 0 : endMs,
    }
  })
}
