/**
 * Validate band schedule data structure
 * @param {Array} data - Array of band objects
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateBandsData(data) {
  if (!Array.isArray(data)) {
    return { valid: false, error: 'Schedule data must be an array' }
  }

  if (data.length === 0) {
    return { valid: false, error: 'Schedule contains no bands' }
  }

  for (let i = 0; i < data.length; i++) {
    const band = data[i]
    const bandNum = i + 1

    // Check required fields
    if (!band.id || typeof band.id !== 'string') {
      return { valid: false, error: `Band ${bandNum}: Missing or invalid 'id' field` }
    }

    if (!band.name || typeof band.name !== 'string') {
      return { valid: false, error: `Band ${bandNum} (${band.id}): Missing or invalid 'name' field` }
    }

    if (!band.venue || typeof band.venue !== 'string') {
      return { valid: false, error: `Band ${bandNum} (${band.id}): Missing or invalid 'venue' field` }
    }

    if (!band.date || typeof band.date !== 'string') {
      return { valid: false, error: `Band ${bandNum} (${band.id}): Missing or invalid 'date' field` }
    }

    if (!band.startTime || typeof band.startTime !== 'string') {
      return { valid: false, error: `Band ${bandNum} (${band.id}): Missing or invalid 'startTime' field` }
    }

    if (!band.endTime || typeof band.endTime !== 'string') {
      return { valid: false, error: `Band ${bandNum} (${band.id}): Missing or invalid 'endTime' field` }
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(band.date)) {
      return {
        valid: false,
        error: `Band ${bandNum} (${band.id}): Date must be in YYYY-MM-DD format, got '${band.date}'`
      }
    }

    // Validate time format (HH:MM)
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(band.startTime)) {
      return {
        valid: false,
        error: `Band ${bandNum} (${band.id}): Start time must be in HH:MM format, got '${band.startTime}'`
      }
    }

    if (!timeRegex.test(band.endTime)) {
      return {
        valid: false,
        error: `Band ${bandNum} (${band.id}): End time must be in HH:MM format, got '${band.endTime}'`
      }
    }

    // Validate that date is parseable
    const bandDate = new Date(band.date)
    if (isNaN(bandDate.getTime())) {
      return {
        valid: false,
        error: `Band ${bandNum} (${band.id}): Invalid date '${band.date}'`
      }
    }

    // Validate that times are parseable
    const startDateTime = new Date(`${band.date}T${band.startTime}:00`)
    const endDateTime = new Date(`${band.date}T${band.endTime}:00`)

    if (isNaN(startDateTime.getTime())) {
      return {
        valid: false,
        error: `Band ${bandNum} (${band.id}): Invalid start time '${band.startTime}'`
      }
    }

    if (isNaN(endDateTime.getTime())) {
      return {
        valid: false,
        error: `Band ${bandNum} (${band.id}): Invalid end time '${band.endTime}'`
      }
    }

    // Validate that end time is after start time (accounting for midnight crossover)
    // For simplicity, we'll allow any end time since shows can go past midnight
  }

  return { valid: true, error: null }
}
