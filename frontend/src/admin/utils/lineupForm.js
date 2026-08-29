/**
 * Parse the duration field used by the lineup form.
 *
 * @param {string|number} input
 * @returns {number|null}
 */
export function parseDuration(input) {
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  // Check AFTER rounding, not only before: 0.4 is positive but rounds to 0, and
  // a 0-minute set gives a performance identical start and end times. That is
  // the zero-length-set condition the server rejects in validateSetTimes and
  // that the two sides of the boundary used to disagree about — 24 hours to the
  // backend conflict detector, 0 minutes to the frontend. Do not let the form
  // produce it in the first place.
  const rounded = Math.round(parsed)
  return rounded > 0 ? rounded : null
}

/**
 * Build the API payload for a lineup performance from form state.
 *
 * @param {object} formData
 * @returns {object}
 */
export function buildPerformancePayload(formData) {
  const socialLinks = {
    website: formData.website || '',
    instagram: formData.instagram || '',
    bandcamp: formData.bandcamp || '',
    facebook: formData.facebook || '',
    youtube: formData.youtube || '',
    spotify: formData.spotify || '',
    apple_music: formData.apple_music || '',
    linktree: formData.linktree || '',
  }

  const originDisplay = [formData.origin_city, formData.origin_region].filter(Boolean).join(', ') || ''

  return {
    eventId: Number(formData.event_id),
    venueId: formData.venue_id ? Number(formData.venue_id) : null,
    name: formData.name,
    startTime: formData.start_time,
    endTime: formData.end_time,
    performanceDate: formData.performance_date || null,
    notes: formData.notes,
    genre: formData.genre,
    origin: originDisplay,
    origin_city: formData.origin_city,
    origin_region: formData.origin_region,
    contact_email: formData.contact_email,
    is_active: Number(formData.is_active) === 1,
    description: formData.description,
    photo_url: formData.photo_url,
    photo_alt_text: formData.photo_alt_text,
    social_links: JSON.stringify(socialLinks),
    url: formData.url,
  }
}
