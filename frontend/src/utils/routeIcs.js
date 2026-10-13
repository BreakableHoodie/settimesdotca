import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from './festivalDays'
import { DEFAULT_SET_DURATION_MS } from './bandUtils'

// Wall-clock arithmetic in UTC, which has no DST. The device's own zone must
// never apply: a London phone adding an hour across ITS spring-forward would
// shift a Toronto set's end time.
function dateFromParts(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function nextCalendarDay(date) {
  const next = dateFromParts(date)
  next.setUTCDate(next.getUTCDate() + 1)
  return formatDate(next)
}

function addMinutes(date, time, minutes) {
  const [hour, minute] = time.split(':').map(Number)
  const result = dateFromParts(date)
  result.setUTCHours(hour, minute + minutes, 0, 0)
  return {
    date: formatDate(result),
    time: `${String(result.getUTCHours()).padStart(2, '0')}:${String(result.getUTCMinutes()).padStart(2, '0')}`,
  }
}

// Set times are Toronto wall-clock times. Without a TZID, RFC 5545 reads
// DTSTART as FLOATING, so a traveller's calendar shows a 20:00 set at 20:00
// wherever they are. X-WR-TIMEZONE is a non-standard hint and does not fix
// that. The rules are Canada's since 2007. The server feed
// (functions/api/feeds/ical.js) carries the same block; Pages Functions cannot
// import from frontend/, so keep the two in step.
const TORONTO_TZID = 'America/Toronto'
const TORONTO_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TORONTO_TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

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
    ...TORONTO_VTIMEZONE,
  ]

  for (const set of sets ?? []) {
    // A set needs a date from itself OR the event; the schedule response can
    // arrive without an event record, and every set still carries its own.
    const festivalDate = set.performance_date || set.date || eventDate
    if (!set.startTime || !festivalDate) continue

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
      `DTSTART;TZID=${TORONTO_TZID}:${startDate.replace(/-/g, '')}T${set.startTime.replace(/:/g, '')}00`,
      `DTEND;TZID=${TORONTO_TZID}:${endDate.replace(/-/g, '')}T${endTime.replace(/:/g, '')}00`,
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
