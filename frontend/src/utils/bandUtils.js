const MS_PER_DAY = 24 * 60 * 60 * 1000
// Times starting before 6 AM are treated as after-midnight sets of the event night,
// so they sort after same-day evening sets rather than appearing at the top of the schedule.
const AFTER_MIDNIGHT_THRESHOLD_HOUR = 6

/**
 * Enriches raw band data with precomputed startMs/endMs timestamps.
 * Handles after-midnight sets by detecting start times before AFTER_MIDNIGHT_THRESHOLD_HOUR
 * and offsetting them by one day so they sort correctly after evening performances.
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
