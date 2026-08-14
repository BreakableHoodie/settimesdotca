import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from '../../utils/festivalDays'
import { compareByName } from '../../utils/sortableName'

const MINUTES_PER_DAY = 24 * 60
// Bands starting before this hour are treated as after-midnight (same night as the preceding
// evening). Derived from the canonical AFTER_MIDNIGHT_THRESHOLD_HOUR in festivalDays.js (#550)
// so this offset can never drift from bandUtils.js's prepareBands offset.
export const AFTER_MIDNIGHT_THRESHOLD_MINUTES = AFTER_MIDNIGHT_THRESHOLD_HOUR * 60

const isNumber = value => typeof value === 'number' && Number.isFinite(value)

export const parseTimeToMinutes = time => {
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (!isNumber(hours) || !isNumber(minutes)) {
    return null
  }
  return hours * 60 + minutes
}

const normalizeEndMinutes = (startMinutes, endMinutes) => {
  if (!isNumber(startMinutes) || !isNumber(endMinutes)) {
    return null
  }
  return endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes
}

const buildTimeIntervals = (startTime, endTime) => {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) {
    return []
  }

  const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes)
  if (normalizedEnd == null || normalizedEnd === startMinutes) {
    return []
  }

  return [
    [startMinutes, normalizedEnd],
    [startMinutes + MINUTES_PER_DAY, normalizedEnd + MINUTES_PER_DAY],
  ]
}

export const calculateEndTimeFromDuration = (startTime, durationMinutes) => {
  if (!startTime || durationMinutes === '' || durationMinutes == null) {
    return ''
  }

  const duration = Number(durationMinutes)
  if (!Number.isFinite(duration) || duration <= 0) {
    return ''
  }

  const [hours, minutes] = startTime.split(':').map(Number)
  if (!isNumber(hours) || !isNumber(minutes)) {
    return ''
  }

  const totalMinutes = hours * 60 + minutes + duration
  const normalizedMinutes = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const endHours = Math.floor(normalizedMinutes / 60)
  const endMins = normalizedMinutes % 60

  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`
}

export const calculateStartTimeFromDuration = (endTime, durationMinutes) => {
  if (!endTime || durationMinutes === '' || durationMinutes == null) {
    return ''
  }

  const duration = Number(durationMinutes)
  if (!Number.isFinite(duration) || duration <= 0) {
    return ''
  }

  const [hours, minutes] = endTime.split(':').map(Number)
  if (!isNumber(hours) || !isNumber(minutes)) {
    return ''
  }

  const endTotalMinutes = hours * 60 + minutes
  const totalMinutes = endTotalMinutes - duration
  const normalizedMinutes = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const startHours = Math.floor(normalizedMinutes / 60)
  const startMins = normalizedMinutes % 60

  return `${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')}`
}

export const deriveDurationMinutes = (startTime, endTime) => {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) {
    return null
  }

  const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes)
  if (normalizedEnd == null) {
    return null
  }

  return normalizedEnd - startMinutes
}

const intervalsOverlap = (intervalA, intervalB) => intervalA[0] < intervalB[1] && intervalB[0] < intervalA[1]

// The festival day a performance belongs to: its own performance_date if set,
// else the fallback event date supplied by the caller. Returns null when
// neither is available, which — critically — makes the day-scope check below
// a no-op (see detectConflicts).
//
// Exported (#588) so LineupTab's Day column/sort/filter resolve a
// performance's festival day the same way detectConflicts's day-scoping
// does — the NULL-performance_date-inherits-event-start-date convention must
// never drift between the two call sites.
export const resolveFestivalDay = (performance, eventDate) => performance?.performance_date || eventDate || null

// Returns { overlaps: string[], conflicts: string[] }
// conflicts = exact same start AND end time; overlaps = any other time intersection
//
// `eventDate` is an optional fallback festival day (typically the event's own
// `date`) used for performances whose `performance_date` is NULL — i.e. every
// row today, since performance_date is a brand-new nullable column (#537).
// Two performances scoped to different festival days can never conflict, no
// matter how their clock times compare (a Day-1 8 PM set and a Day-2 8 PM set
// are not the same slot). When neither side has day info (no performance_date
// on either performance AND no eventDate passed — today's single-day call
// sites), resolveFestivalDay returns null for both and the day-scope check
// short-circuits, leaving behavior byte-identical to before #538.
export const detectConflicts = (candidateBand, bands, eventDate = null) => {
  const empty = { overlaps: [], conflicts: [] }
  if (!candidateBand || !bands?.length) return empty

  const { event_id: eventId, venue_id: venueId, start_time: startTime, end_time: endTime, id } = candidateBand
  if (!eventId || !venueId || !startTime || !endTime) return empty

  const bandIntervals = buildTimeIntervals(startTime, endTime)
  if (!bandIntervals.length) return empty

  const candidateDay = resolveFestivalDay(candidateBand, eventDate)

  const overlaps = []
  const conflicts = []

  for (const other of bands) {
    if (!other) continue
    if (id != null && other.id === id) continue
    if (!other.event_id || !other.venue_id) continue
    if (Number(other.event_id) !== Number(eventId) || Number(other.venue_id) !== Number(venueId)) continue

    const otherDay = resolveFestivalDay(other, eventDate)
    if (candidateDay && otherDay && candidateDay !== otherDay) continue

    const otherIntervals = buildTimeIntervals(other.start_time, other.end_time)
    if (!otherIntervals.some(b => bandIntervals.some(a => intervalsOverlap(a, b)))) continue

    if (other.start_time === startTime && other.end_time === endTime) {
      conflicts.push(other.name)
    } else {
      overlaps.push(other.name)
    }
  }

  return { overlaps, conflicts }
}

const formatTimeLabel = time => {
  if (!time) return '—'
  const [hours, minutes] = time.split(':')
  const parsedHours = Number(hours)
  if (!isNumber(parsedHours)) {
    return '—'
  }

  const period = parsedHours >= 12 ? 'PM' : 'AM'
  const displayHour = parsedHours === 0 ? 12 : parsedHours > 12 ? parsedHours - 12 : parsedHours
  return `${displayHour}:${minutes} ${period}`
}

export const formatTimeRangeLabel = (startTime, endTime) => {
  const startLabel = formatTimeLabel(startTime)
  const endLabel = formatTimeLabel(endTime)
  if (startLabel === '—' && endLabel === '—') {
    return '—'
  }
  return `${startLabel} – ${endLabel}`
}

export const formatDurationLabel = (startTime, endTime) => {
  const durationMinutes = deriveDurationMinutes(startTime, endTime)
  if (durationMinutes == null) {
    return '—'
  }
  return `${durationMinutes} min`
}

export const adjustForMidnight = mins =>
  mins !== null && mins < AFTER_MIDNIGHT_THRESHOLD_MINUTES ? mins + MINUTES_PER_DAY : mins

export const sortBandsByStart = bands => {
  if (!Array.isArray(bands)) {
    return []
  }

  return [...bands].sort((bandA, bandB) => {
    const aMinutes = parseTimeToMinutes(bandA?.start_time)
    const bMinutes = parseTimeToMinutes(bandB?.start_time)

    if (aMinutes == null && bMinutes == null) {
      // Article-stripped alphabetization (#587) — "The Anti-Queens" sorts under A.
      return compareByName(bandA, bandB)
    }

    if (aMinutes == null) return 1
    if (bMinutes == null) return -1

    const aAdj = adjustForMidnight(aMinutes)
    const bAdj = adjustForMidnight(bMinutes)

    if (aAdj === bAdj) {
      return compareByName(bandA, bandB)
    }

    return aAdj - bAdj
  })
}
