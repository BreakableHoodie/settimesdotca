const MINUTES_PER_DAY = 24 * 60

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
  return endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes
}

export const buildTimeIntervals = (startTime, endTime) => {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) {
    return []
  }

  const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes)
  if (normalizedEnd == null) {
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

export const detectConflicts = (candidateBand, bands) => {
  if (!candidateBand || !bands?.length) {
    return []
  }

  const { event_id: eventId, venue_id: venueId, start_time: startTime, end_time: endTime, id } = candidateBand
  if (!eventId || !venueId || !startTime || !endTime) {
    return []
  }

  const bandIntervals = buildTimeIntervals(startTime, endTime)
  if (!bandIntervals.length) {
    return []
  }

  return bands
    .filter(other => {
      if (!other) return false
      if (id != null && other.id === id) return false
      if (!other.event_id || !other.venue_id) return false
      return Number(other.event_id) === Number(eventId) && Number(other.venue_id) === Number(venueId)
    })
    .filter(other => {
      const otherIntervals = buildTimeIntervals(other.start_time, other.end_time)
      return otherIntervals.some(intervalB => bandIntervals.some(intervalA => intervalsOverlap(intervalA, intervalB)))
    })
    .map(other => other.name)
}

export const formatTimeLabel = time => {
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

export const sortBandsByStart = bands => {
  if (!Array.isArray(bands)) {
    return []
  }

  return [...bands].sort((bandA, bandB) => {
    const aMinutes = parseTimeToMinutes(bandA?.start_time)
    const bMinutes = parseTimeToMinutes(bandB?.start_time)

    if (aMinutes == null && bMinutes == null) {
      return (bandA?.name || '').localeCompare(bandB?.name || '')
    }

    if (aMinutes == null) return 1
    if (bMinutes == null) return -1

    if (aMinutes === bMinutes) {
      return (bandA?.name || '').localeCompare(bandB?.name || '')
    }

    return aMinutes - bMinutes
  })
}
