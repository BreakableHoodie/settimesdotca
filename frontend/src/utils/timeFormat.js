/**
 * Format 24-hour time to 12-hour format with AM/PM
 * @param {string} time24 - Time in 24-hour format (e.g., "14:30")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
export function formatTime(time24) {
  const [hours, minutes] = time24.split(':').map(Number)
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
export function formatTimeRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`
}
