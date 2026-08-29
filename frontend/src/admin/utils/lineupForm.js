import { LINK_FIELDS } from './bandFields'

/**
 * Parse the duration field used by the lineup form, in minutes.
 *
 * @param {string|number} input - raw form value
 * @returns {number|null} a positive whole number of minutes, or `null` when the
 *   input is non-numeric, non-positive, or rounds to zero (see below)
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
 * Build the API payload for a lineup performance from admin form state.
 *
 * Four transformations are not obvious from the shape and callers depend on them:
 *
 * - `social_links` is a **JSON string**, not an object, and always carries every
 *   key in `LINK_FIELDS` — absent inputs become `''` rather than being omitted.
 * - `origin` is DERIVED, joining `origin_city` and `origin_region` with ", ".
 *   The two parts are also sent separately; `origin` is the legacy display form.
 * - Empty `venue_id` and `performance_date` become `null`, not `''`, because the
 *   API treats an empty string as a value and `null` as "unset".
 * - `is_active` arrives as a numeric form value and leaves as a **boolean**.
 *
 * @param {object} formData - flat admin form state; keys match the field names
 *   in the lineup form (`event_id`, `venue_id`, `name`, `start_time`,
 *   `end_time`, `performance_date`, the `LINK_FIELDS` keys, and the profile
 *   fields mirrored below)
 * @returns {object} payload for POST/PATCH /api/admin/bands
 */
export function buildPerformancePayload(formData) {
  // Derived from the registry rather than hand-listed. This used to be eight
  // hardcoded keys, which made it a second list of link fields — the exact
  // duplication bandFields.js exists to prevent, and the reason a ninth
  // platform would have been silently dropped from this write path while the
  // Links column and gap filter picked it up.
  const socialLinks = Object.fromEntries(LINK_FIELDS.map(({ key }) => [key, formData[key] || '']))

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
