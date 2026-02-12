/**
 * Time filtering utilities for concert performances
 */

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
 * Get start of day (00:00:00) for a given date
 */
export function getStartOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get end of day (23:59:59) for a given date
 */
export function getEndOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Get start of week (Monday) for a given date
 */
export function getStartOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  d.setDate(diff)
  return getStartOfDay(d)
}

/**
 * Get end of week (Sunday) for a given date
 */
export function getEndOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? 0 : 7) // Adjust when day is Sunday
  d.setDate(diff)
  return getEndOfDay(d)
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
  if (isHappeningThisWeek(performance)) {
    const startDate = new Date(startTime)
    return `${startDate.toLocaleDateString([], { weekday: 'long' })} ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
  }

  // If performance is next week
  if (isHappeningNextWeek(performance)) {
    const startDate = new Date(startTime)
    return `Next ${startDate.toLocaleDateString([], { weekday: 'long' })} at ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
  }

  // Default to formatted date and time
  const startDate = new Date(startTime)
  return `${startDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}${durationStr}`
}
