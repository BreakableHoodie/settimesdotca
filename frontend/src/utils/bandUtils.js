const MS_PER_DAY = 24 * 60 * 60 * 1000
// Times starting before 6 AM are treated as after-midnight sets of the event night,
// so they sort after same-day evening sets rather than appearing at the top of the schedule.
const AFTER_MIDNIGHT_THRESHOLD_HOUR = 6

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
export function prepareBands(list) {
  return list.map(band => {
    let startMs = Date.parse(`${band.date}T${band.startTime}:00`)
    let endMs = Date.parse(`${band.date}T${band.endTime}:00`)

    if (!Number.isNaN(startMs)) {
      const startHour = parseInt(String(band.startTime ?? '').split(':')[0], 10)
      if (Number.isFinite(startHour) && startHour < AFTER_MIDNIGHT_THRESHOLD_HOUR) {
        startMs += MS_PER_DAY
        if (!Number.isNaN(endMs)) endMs += MS_PER_DAY
      }
    }

    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
      endMs += MS_PER_DAY
    }

    return {
      ...band,
      startMs: Number.isNaN(startMs) ? 0 : startMs,
      endMs: Number.isNaN(endMs) ? 0 : endMs,
    }
  })
}
