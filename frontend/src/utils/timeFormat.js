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
