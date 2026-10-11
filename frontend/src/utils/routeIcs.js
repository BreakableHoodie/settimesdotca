import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from './festivalDays'
import { DEFAULT_SET_DURATION_MS } from './bandUtils'

function dateFromParts(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function nextCalendarDay(date) {
  const next = dateFromParts(date)
  next.setDate(next.getDate() + 1)
  return formatDate(next)
}

function addMinutes(date, time, minutes) {
  const [hour, minute] = time.split(':').map(Number)
  const result = dateFromParts(date)
  result.setHours(hour, minute + minutes, 0, 0)
  return {
    date: formatDate(result),
    time: `${String(result.getHours()).padStart(2, '0')}:${String(result.getMinutes()).padStart(2, '0')}`,
  }
}

function escapeIcal(text) {
  if (!text) return ''
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

function calendarDateForSet(set, eventDate) {
  const date = set.performance_date || set.date || eventDate
  const hour = Number.parseInt(String(set.startTime).split(':')[0], 10)
  return hour < AFTER_MIDNIGHT_THRESHOLD_HOUR ? nextCalendarDay(date) : date
}

export function buildRouteIcs({ event, sets }) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const eventDate = event?.date
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SetTimes//settimes.ca//EN',
    `X-WR-CALNAME:${escapeIcal(event?.name || event?.slug || 'settimes.ca')}`,
    'X-WR-TIMEZONE:America/Toronto',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const set of sets ?? []) {
    if (!set.startTime || !eventDate) continue

    const festivalDate = set.performance_date || set.date || eventDate
    const startDate = calendarDateForSet(set, eventDate)
    const hasEnd = Boolean(set.endTime)
    const derivedEnd = hasEnd ? null : addMinutes(startDate, set.startTime, DEFAULT_SET_DURATION_MS / 60000)
    const endTime = set.endTime || derivedEnd.time
    const endDate = hasEnd && endTime < set.startTime ? nextCalendarDay(startDate) : derivedEnd?.date || startDate
    const performanceId = set.performance_id ?? set.id
    const name = set.name || set.band_name || 'Unknown performer'
    const venue = set.venue || set.venue_name || 'TBD'
    // Join with a REAL newline and let escapeIcal encode it once. Joining with
    // a literal "\\n" and then escaping doubled the backslash, so calendars
    // showed "\n" as text (the server feed had the same bug).
    const description = [name, venue ? `Venue: ${venue}` : '', set.description || set.notes || '']
      .filter(Boolean)
      .join('\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:performance-${performanceId}-${festivalDate}@settimes.ca`,
      `DTSTAMP:${now}`,
      `DTSTART:${startDate.replace(/-/g, '')}T${set.startTime.replace(/:/g, '')}00`,
      `DTEND:${endDate.replace(/-/g, '')}T${endTime.replace(/:/g, '')}00`,
      `SUMMARY:${escapeIcal(name)}`,
      `LOCATION:${escapeIcal(venue)}`,
      `DESCRIPTION:${escapeIcal(description)}`,
      set.is_cancelled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
