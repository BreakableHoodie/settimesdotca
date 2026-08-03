/**
 * Format 24-hour time to 12-hour format with AM/PM
 * @param {string} time24 - Time in 24-hour format (e.g., "14:30")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
const isValidTimeString = value => /^\d{1,2}:\d{2}$/.test(String(value || ''))

export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3) {
    return null
  }
  const [year, month, day] = parts
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  return new Date(year, month - 1, day)
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Format a performance's date for display, appending a "(Day N)" label when
 * the event is multi-day (#739).
 *
 * - Uses `performance_date` when present, falling back to `event_date` (the
 *   #543 convention: day-1 sets and single-day events store NULL
 *   performance_date).
 * - The "(Day N)" suffix is gated on `event_end_date` being non-null — a
 *   single-day event must never show a day label (#540/#541 convention).
 * - `performance_date` already stores the EVENING a set belongs to, so no
 *   after-midnight (6AM) offset is applied here on top of it — that would
 *   wrongly push a 00:35 set stored under day 1 to "(Day 2)".
 * - Day offset arithmetic uses parseLocalDate (calendar-local midnight), not
 *   `new Date('YYYY-MM-DD')`, which parses as UTC midnight and shifts the
 *   day in UTC-negative timezones.
 *
 * @param {{performance_date?: string|null, event_date?: string|null, event_end_date?: string|null}} performance
 * @returns {string|null}
 */
export function formatPerformanceDayLabel(performance) {
  const rawDate = performance?.performance_date || performance?.event_date
  if (!rawDate) return null

  const displayDate = parseLocalDate(rawDate) || new Date(rawDate)
  const dateLabel = displayDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  if (!performance?.event_end_date) {
    return dateLabel
  }

  const eventStart = parseLocalDate(performance.event_date)
  const perfDay = parseLocalDate(rawDate)
  if (!eventStart || !perfDay) {
    return dateLabel
  }

  const dayOffset = Math.round((perfDay.getTime() - eventStart.getTime()) / MS_PER_DAY)
  const dayNumber = dayOffset + 1

  return dayNumber >= 1 ? `${dateLabel} (Day ${dayNumber})` : dateLabel
}

export function formatTime(time24, { fallback = '—' } = {}) {
  if (!isValidTimeString(time24)) {
    return fallback
  }
  const [hours, minutes] = String(time24).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback
  }
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Format time range from 24-hour format to 12-hour format
 * @param {string} start - Start time in 24-hour format
 * @param {string} end - End time in 24-hour format
 * @returns {string} Formatted time range (e.g., "2:30 PM - 3:00 PM")
 */
export function formatTimeRange(start, end, { fallback = '—', unknownLabel = 'Time TBD' } = {}) {
  const startLabel = formatTime(start, { fallback })
  const endLabel = formatTime(end, { fallback })
  if (startLabel === fallback && endLabel === fallback) {
    return unknownLabel
  }
  if (startLabel === fallback) {
    return endLabel
  }
  if (endLabel === fallback) {
    return startLabel
  }
  return `${startLabel} - ${endLabel}`
}
