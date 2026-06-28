// Input validation utilities
// Security: client-side validation of field lengths and formats.
//
// NOTE: HTML sanitization (DOMPurify) intentionally does NOT live here. The
// only consumers of this module from the public entry path import plain data
// validators (FIELD_LIMITS, validatePasswordStrength, validateBandsData), none
// of which need DOMPurify. Components that actually render user HTML
// (BandProfilePage, admin RichTextEditor) import the `dompurify` package
// directly, so DOMPurify stays out of the eagerly-loaded LCP bundle. Do not
// reintroduce a DOMPurify import here — it would pull ~8-9kB gzip back into the
// public entry chunk (see issue #368).

/**
 * Centralized field length limits - MUST match backend limits
 */
export const FIELD_LIMITS = {
  // User fields
  email: { min: 5, max: 255 },
  password: { min: 12, max: 128 },
  userName: { min: 2, max: 100 },
  userFirstName: { min: 1, max: 60 },
  userLastName: { min: 1, max: 60 },

  // Venue fields
  venueName: { min: 1, max: 200 },
  venueAddress: { min: 0, max: 200 },
  venueAddressLine1: { min: 0, max: 200 },
  venueAddressLine2: { min: 0, max: 200 },
  venueCity: { min: 0, max: 100 },
  venueRegion: { min: 0, max: 100 },
  venuePostal: { min: 0, max: 20 },
  venueCountry: { min: 0, max: 100 },
  venuePhone: { min: 0, max: 25 },
  venueContactEmail: { min: 0, max: 255 },

  // Band fields
  bandName: { min: 1, max: 200 },
  bandOrigin: { min: 0, max: 100 },
  bandOriginCity: { min: 0, max: 100 },
  bandOriginRegion: { min: 0, max: 100 },
  bandGenre: { min: 0, max: 100 },
  bandDescription: { min: 0, max: 5000 },
  bandUrl: { min: 0, max: 500 },
  socialHandle: { min: 0, max: 100 },
  bandContactEmail: { min: 0, max: 255 },

  // Event fields
  eventName: { min: 3, max: 200 },
  eventSlug: { min: 3, max: 100 },
  ticketLink: { min: 0, max: 500 },
  eventDescription: { min: 0, max: 5000 },
  eventCity: { min: 0, max: 100 },
  eventVenueInfo: { min: 0, max: 5000 },
  eventSocialLinks: { min: 0, max: 2000 },

  // Generic
  url: { min: 0, max: 2000 },
  shortText: { min: 0, max: 255 },
  longText: { min: 0, max: 10000 },
}

/**
 * Validate password strength with enterprise-grade policy.
 * @param {string} password
 * @returns {string|null} Error message or null if valid
 */
export function validatePasswordStrength(password) {
  if (!password) return 'Password is required'
  if (password.length < FIELD_LIMITS.password.min) {
    return `Password must be at least ${FIELD_LIMITS.password.min} characters`
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter'
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter'
  }
  if (!/\d/.test(password)) {
    return 'Password must contain at least one number'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character'
  }
  return null
}

/**
 * Legacy function for validating bands data structure
 * @param {Array} data - Bands data array
 * @returns {Object} Validation result
 */
export function validateBandsData(data) {
  if (!Array.isArray(data)) {
    return { valid: false, error: 'Bands data must be an array' }
  }

  for (const band of data) {
    if (!band.name || typeof band.name !== 'string') {
      return { valid: false, error: 'Each band must have a name string' }
    }
    if (!band.date || typeof band.date !== 'string') {
      return { valid: false, error: 'Each band must have a date string' }
    }
  }

  return { valid: true }
}
