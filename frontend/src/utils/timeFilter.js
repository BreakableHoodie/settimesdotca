/**
 * Time filtering utilities for concert performances
 */

import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from './festivalDays'

const DEBUG_TIME_KEY = '__debugScheduleTime'

/**
 * Get current date/time in the event's timezone
 * For now, using local timezone - can be made configurable later
 */
export function getCurrentDateTime() {
  if (typeof globalThis !== 'undefined' && globalThis[DEBUG_TIME_KEY]) {
    const parsed = new Date(globalThis[DEBUG_TIME_KEY])
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return new Date()
}

/**
 * A "festival day" runs AFTER_MIDNIGHT_THRESHOLD_HOUR -> AFTER_MIDNIGHT_THRESHOLD_HOUR
 * (6 AM -> 6 AM), not calendar midnight -> midnight (#542). A set starting at
 * 1 AM is still "tonight" in festival terms (see AFTER_MIDNIGHT_THRESHOLD_HOUR's
 * doc in festivalDays.js and prepareBands() in bandUtils.js, which offsets
 * such sets' startMs/endMs by +1 day so they sort after the same evening's
 * earlier sets). Returns a new Date at exactly AFTER_MIDNIGHT_THRESHOLD_HOUR
 * on the calendar day this timestamp's festival day belongs to — shifting
 * back one calendar day when `date`'s clock time is before the threshold, so
 * that a 1 AM check and an 11 PM check the same festival evening both land
 * on the same festival-day boundary.
 */
function festivalDayStart(date) {
  const d = new Date(date)
  if (d.getHours() < AFTER_MIDNIGHT_THRESHOLD_HOUR) {
    d.setDate(d.getDate() - 1)
  }
  d.setHours(AFTER_MIDNIGHT_THRESHOLD_HOUR, 0, 0, 0)
  return d
}

/**
 * Get start of the festival day (AFTER_MIDNIGHT_THRESHOLD_HOUR, e.g. 6 AM) for
 * a given date/time.
 */
export function getStartOfDay(date) {
  return festivalDayStart(date)
}

/**
 * Get end of the festival day: 1 ms before the next festival day's start
 * (AFTER_MIDNIGHT_THRESHOLD_HOUR on the following calendar day). Mirrors the
 * previous calendar-midnight `23,59,59,999` precision, just shifted to the
 * festival-day boundary so the instant AFTER_MIDNIGHT_THRESHOLD_HOUR itself
 * belongs to exactly one day, never both.
 */
export function getEndOfDay(date) {
  const d = festivalDayStart(date)
  d.setDate(d.getDate() + 1)
  d.setMilliseconds(d.getMilliseconds() - 1)
  return d
}

/**
 * Get start of week (Monday, at the festival-day boundary) for a given date.
 * Resolves the date to its festival day FIRST (via festivalDayStart, which
 * also normalizes the time to the threshold hour so the day-of-week lookup
 * below isn't re-shifted by a leftover pre-threshold hour) before finding
 * that festival day's Monday — otherwise a 1 AM Monday check would use the
 * calendar day-of-week (Monday) instead of the festival day-of-week (the
 * previous Sunday), landing on the wrong week (#542).
 */
export function getStartOfWeek(date) {
  const d = festivalDayStart(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  d.setDate(diff)
  return d
}

/**
 * Get end of week: 1 ms before the following week's start, mirroring
 * getEndOfDay's approach so the two week boundaries never overlap.
 */
export function getEndOfWeek(date) {
  const d = getStartOfWeek(date)
  d.setDate(d.getDate() + 7)
  d.setMilliseconds(d.getMilliseconds() - 1)
  return d
}

/**
 * Get start of next week (Monday of next week)
 */
export function getStartOfNextWeek(date) {
  const startOfThisWeek = getStartOfWeek(date)
  const nextWeek = new Date(startOfThisWeek)
  nextWeek.setDate(nextWeek.getDate() + 7)
  return nextWeek
}

/**
 * Get end of next week (Sunday of next week)
 */
export function getEndOfNextWeek(date) {
  const startOfNextWeek = getStartOfNextWeek(date)
  return getEndOfWeek(startOfNextWeek)
}

/**
 * Check if a performance is happening now (within the last 30 minutes and next 30 minutes)
 */
export function isHappeningNow(performance) {
  if (!performance.startMs || !performance.endMs) return false

  const now = getCurrentDateTime().getTime()
  const thirtyMinutes = 30 * 60 * 1000

  return performance.startMs <= now + thirtyMinutes && performance.endMs >= now - thirtyMinutes
}

/**
 * Check if a performance is happening today
 */
export function isHappeningToday(performance) {
  if (!performance.startMs) return false

  const today = getCurrentDateTime()
  const startOfToday = getStartOfDay(today).getTime()
  const endOfToday = getEndOfDay(today).getTime()

  return performance.startMs >= startOfToday && performance.startMs <= endOfToday
}

/**
 * Check if a performance is happening this week
 */
export function isHappeningThisWeek(performance) {
  if (!performance.startMs) return false

  const today = getCurrentDateTime()
  const startOfWeek = getStartOfWeek(today).getTime()
  const endOfWeek = getEndOfWeek(today).getTime()

  return performance.startMs >= startOfWeek && performance.startMs <= endOfWeek
}

/**
 * Check if a performance is happening next week
 */
export function isHappeningNextWeek(performance) {
  if (!performance.startMs) return false

  const today = getCurrentDateTime()
  const startOfNextWeek = getStartOfNextWeek(today).getTime()
  const endOfNextWeek = getEndOfNextWeek(today).getTime()

  return performance.startMs >= startOfNextWeek && performance.startMs <= endOfNextWeek
}

/**
 * Check if a performance is happening this month
 */
export function isHappeningThisMonth(performance) {
  if (!performance.startMs) return false

  const today = getCurrentDateTime()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).getTime()

  return performance.startMs >= startOfMonth && performance.startMs <= endOfMonth
}

/**
 * Check if a performance is happening next month
 */
export function isHappeningNextMonth(performance) {
  if (!performance.startMs) return false

  const today = getCurrentDateTime()
  const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime()
  const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0, 23, 59, 59, 999).getTime()

  return performance.startMs >= startOfNextMonth && performance.startMs <= endOfNextMonth
}

/**
 * Filter performances by time period
 */
export function filterPerformancesByTime(performances, timeFilter) {
  if (!performances || !Array.isArray(performances)) return []

  switch (timeFilter) {
    case 'all':
      return performances
    case 'now':
      return performances.filter(isHappeningNow)
    case 'today':
      return performances.filter(isHappeningToday)
    case 'this-week':
      return performances.filter(isHappeningThisWeek)
    case 'next-week':
      return performances.filter(isHappeningNextWeek)
    case 'this-month':
      return performances.filter(isHappeningThisMonth)
    case 'next-month':
      return performances.filter(isHappeningNextMonth)
    default:
      return performances
  }
}

/**
 * Get time filter options for the UI
 */
export function getTimeFilterOptions() {
  return [
    { value: 'all', label: 'Any Time', description: 'Show all performances' },
    { value: 'now', label: 'Happening Now', description: 'Currently performing or starting soon' },
    { value: 'today', label: 'Today', description: 'Performances happening today' },
    { value: 'this-week', label: 'This Week', description: 'Performances this week' },
    { value: 'next-week', label: 'Next Week', description: 'Performances next week' },
    { value: 'this-month', label: 'This Month', description: 'Performances this month' },
    { value: 'next-month', label: 'Next Month', description: 'Performances next month' },
  ]
}

/**
 * Check if a band is starting soon (within the specified threshold from current time)
 * @param {Object} band - Band object with startMs property
 * @param {Date|number} currentTime - Current time as a Date or ms timestamp; unary + coerces both (allows time injection in tests)
 * @param {number} thresholdMinutes - Minutes threshold (default: 30)
 * @returns {boolean} True if band starts within the threshold and hasn't already started
 */
export function isStartingSoon(band, currentTime, thresholdMinutes = 30) {
  if (!band.startMs) return false
  const nowMs = +currentTime
  const diff = band.startMs - nowMs
  return diff > 0 && diff <= thresholdMinutes * 60000
}

/**
 * Calculate duration in minutes between start and end times
 */
function getDurationMinutes(startMs, endMs) {
  if (!startMs || !endMs) return null
  let durationMs = endMs - startMs
  if (durationMs < 0) {
    durationMs += 24 * 60 * 60 * 1000
  }
  return Math.round(durationMs / (1000 * 60))
}

/**
 * Format duration as human-readable string
 */
function formatDuration(minutes) {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Get a human-readable time description for a performance
 */
export function getTimeDescription(performance) {
  if (!performance.startMs) return 'Time TBD'

  const now = getCurrentDateTime().getTime()
  const startTime = performance.startMs
  const endTime = performance.endMs

  // Calculate duration if end time is available
  const duration = getDurationMinutes(startTime, endTime)
  const durationStr = duration ? ` (${formatDuration(duration)})` : ''

  // If performance is happening now
  if (isHappeningNow(performance)) {
    if (startTime <= now && endTime >= now) {
      return `Happening Now${durationStr}`
    } else if (startTime > now) {
      const minutesUntil = Math.ceil((startTime - now) / (1000 * 60))
      return `Starting in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}${durationStr}`
    }
  }

  // If performance is today
  if (isHappeningToday(performance)) {
    const startDate = new Date(startTime)
    return `Today at ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
  }

  // If performance is this week
  //
  // No weekday name (#681): an after-midnight set's real startMs is already
  // offset +1 calendar day by prepareBands() (bandUtils.js), so the raw
  // Date's weekday is one day ahead of the festival day the set actually
  // belongs to — e.g. a Sunday-night set reads "Monday" here. Same root
  // cause and same fix as formatFestivalDate() (festivalDays.js): drop the
  // ambiguous day label rather than show one that's sometimes wrong.
  if (isHappeningThisWeek(performance)) {
    const startDate = new Date(startTime)
    return `${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
  }

  // If performance is next week — same no-weekday rationale as above.
  if (isHappeningNextWeek(performance)) {
    const startDate = new Date(startTime)
    return `Next week at ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
  }

  // Default to formatted date and time
  //
  // The date comes from the FESTIVAL day, not the raw startMs (#689): an
  // after-midnight set's startMs is already offset +1 calendar day by
  // prepareBands() (bandUtils.js), so the raw Date's date is one day ahead of
  // the evening the set belongs to — e.g. a set that started 00:25 on Aug 7
  // reads "Aug 8" here while DayDivider renders "Aug 7" for the same set.
  // festivalDayStart() resolves the correct festival day, shifting back a
  // calendar day for sub-6AM clock times. Note the this-week / next-week
  // branches do NOT share this resolution: they compare raw startMs against
  // week boundaries and render no date at all, so there is nothing for the
  // +1-day offset to skew there. The clock time itself is likewise unaffected
  // by the offset, so it comes from the raw timestamp.
  const rawStart = new Date(startTime)
  const festivalDay = festivalDayStart(startTime)
  return `${festivalDay.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} ${rawStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
}
