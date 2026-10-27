/**
 * Time filtering utilities for concert performances
 */

import {
  AFTER_MIDNIGHT_THRESHOLD_HOUR,
  AFTER_MIDNIGHT_THRESHOLD_TIME,
  addTorontoDays,
  torontoClock,
  torontoWallClockMs,
} from './festivalDays'

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

// The festival date (YYYY-MM-DD) an instant belongs to: its Toronto date, one
// day earlier before AFTER_MIDNIGHT_THRESHOLD_HOUR.
function festivalDateOf(ms) {
  const clock = torontoClock(ms)
  return clock.hour < AFTER_MIDNIGHT_THRESHOLD_HOUR ? addTorontoDays(clock.date, -1) : clock.date
}

const festivalDayStartMs = festivalDate => torontoWallClockMs(festivalDate, AFTER_MIDNIGHT_THRESHOLD_TIME)

// The Monday of a festival date's week. The weekday comes from a UTC-built
// date, so it never depends on the viewer's zone.
function mondayOf(festivalDate) {
  const [year, month, day] = festivalDate.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return addTorontoDays(festivalDate, weekday === 0 ? -6 : 1 - weekday)
}

// The first of the month `offset` months after `date`'s month, as YYYY-MM-DD.
function firstOfMonth(date, offset) {
  const [year, month] = date.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-01`
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
  return new Date(festivalDayStartMs(festivalDateOf(new Date(date).getTime())))
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
  const festivalDate = festivalDateOf(new Date(date).getTime())
  return new Date(festivalDayStartMs(addTorontoDays(festivalDate, 1)) - 1)
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
  return new Date(festivalDayStartMs(mondayOf(festivalDateOf(new Date(date).getTime()))))
}

/**
 * Get end of week: 1 ms before the following week's start, mirroring
 * getEndOfDay's approach so the two week boundaries never overlap.
 */
export function getEndOfWeek(date) {
  const monday = mondayOf(festivalDateOf(new Date(date).getTime()))
  return new Date(festivalDayStartMs(addTorontoDays(monday, 7)) - 1)
}

/**
 * Get start of next week (Monday of next week)
 */
export function getStartOfNextWeek(date) {
  const monday = mondayOf(festivalDateOf(new Date(date).getTime()))
  return new Date(festivalDayStartMs(addTorontoDays(monday, 7)))
}

/**
 * Get end of next week (Sunday of next week)
 */
export function getEndOfNextWeek(date) {
  const monday = mondayOf(festivalDateOf(new Date(date).getTime()))
  return new Date(festivalDayStartMs(addTorontoDays(monday, 14)) - 1)
}

// Every window below starts and ends on a whole minute, so within one minute
// of "now" none can change. Computing them once per minute keeps a lineup's
// worth of cards to a handful of Intl calls instead of ~70 per card (#1398
// review: ~33 ms per 100 cards on desktop, re-run on every 60 s tick).
let cachedWindows = { minute: NaN, windows: null }
function nowWindows() {
  const now = getCurrentDateTime().getTime()
  const minute = Math.floor(now / 60000)
  if (cachedWindows.minute === minute) return cachedWindows.windows
  const today = festivalDateOf(now)
  const monday = mondayOf(today)
  const { date } = torontoClock(now)
  const windows = {
    today: [festivalDayStartMs(today), festivalDayStartMs(addTorontoDays(today, 1)) - 1],
    thisWeek: [festivalDayStartMs(monday), festivalDayStartMs(addTorontoDays(monday, 7)) - 1],
    nextWeek: [festivalDayStartMs(addTorontoDays(monday, 7)), festivalDayStartMs(addTorontoDays(monday, 14)) - 1],
    thisMonth: [torontoWallClockMs(firstOfMonth(date, 0)), torontoWallClockMs(firstOfMonth(date, 1)) - 1],
    nextMonth: [torontoWallClockMs(firstOfMonth(date, 1)), torontoWallClockMs(firstOfMonth(date, 2)) - 1],
  }
  cachedWindows = { minute, windows }
  return windows
}

const startsWithin = (performance, [start, end]) =>
  Boolean(performance.startMs) && performance.startMs >= start && performance.startMs <= end

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
  return startsWithin(performance, nowWindows().today)
}

/**
 * Check if a performance is happening this week
 */
export function isHappeningThisWeek(performance) {
  return startsWithin(performance, nowWindows().thisWeek)
}

/**
 * Check if a performance is happening next week
 */
export function isHappeningNextWeek(performance) {
  return startsWithin(performance, nowWindows().nextWeek)
}

/**
 * Check if a performance is happening this month
 */
export function isHappeningThisMonth(performance) {
  return startsWithin(performance, nowWindows().thisMonth)
}

/**
 * Check if a performance is happening next month
 */
export function isHappeningNextMonth(performance) {
  return startsWithin(performance, nowWindows().nextMonth)
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
    { value: 'all', label: 'Any time', description: 'Show all performances' },
    { value: 'now', label: 'Happening now', description: 'Currently performing or starting soon' },
    { value: 'today', label: 'Today', description: 'Performances happening today' },
    { value: 'this-week', label: 'This week', description: 'Performances this week' },
    { value: 'next-week', label: 'Next week', description: 'Performances next week' },
    { value: 'this-month', label: 'This month', description: 'Performances this month' },
    { value: 'next-month', label: 'Next month', description: 'Performances next month' },
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
      return `Happening now${durationStr}`
    } else if (startTime > now) {
      const minutesUntil = Math.ceil((startTime - now) / (1000 * 60))
      return `Starting in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}${durationStr}`
    }
  }

  // If performance is today
  if (isHappeningToday(performance)) {
    const startDate = new Date(startTime)
    return `Today at ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' })}${durationStr}`
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
    return `${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' })}${durationStr}`
  }

  // If performance is next week — same no-weekday rationale as above.
  if (isHappeningNextWeek(performance)) {
    const startDate = new Date(startTime)
    return `Next week at ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' })}${durationStr}`
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
    timeZone: 'America/Toronto',
  })} ${rawStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' })}${durationStr}`
}
