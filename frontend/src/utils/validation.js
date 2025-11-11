// Input validation and sanitization utilities
// Security: Prevent XSS and injection attacks

/**
 * Sanitize string input (remove dangerous characters)
 * @param {string} input - Raw user input
 * @returns {string} Sanitized string
 */
export function sanitizeString(input) {
  if (!input) return ''

  return String(input)
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers (onclick=, etc.)
    .substring(0, 1000) // Limit length
}

/**
 * Validate and sanitize URL
 * @param {string} url - URL string
 * @returns {string|null} Validated URL or null
 */
export function validateUrl(url) {
  if (!url) return null

  const sanitized = sanitizeString(url)
  if (!sanitized) return null

  // Must start with http:// or https://
  if (!sanitized.match(/^https?:\/\//i)) {
    // Auto-add https:// if missing
    return `https://${sanitized}`
  }

  return sanitized
}

/**
 * Validate and sanitize email
 * @param {string} email - Email string
 * @returns {boolean}
 */
export function validateEmail(email) {
  if (!email) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate and sanitize phone number
 * @param {string} phone - Phone number string
 * @returns {boolean}
 */
export function validatePhone(phone) {
  if (!phone) return true // Optional field
  const phoneRegex = /^[\d\s+()-]+$/
  return phoneRegex.test(phone)
}

/**
 * Validate address format
 * @param {string} address - Address string
 * @returns {boolean}
 */
export function validateAddress(address) {
  if (!address) return true // Optional
  const sanitized = sanitizeString(address)
  // Basic validation: should have street number or building name
  return sanitized.length >= 3 && !sanitized.match(/[<>]/)
}

/**
 * Validate Instagram handle
 * @param {string} handle - Instagram handle
 * @returns {string|null}
 */
export function validateInstagramHandle(handle) {
  if (!handle) return null
  const sanitized = sanitizeString(handle).replace(/@/g, '').replace(/^/, '@')
  return sanitized.substring(0, 31) // IG max length
}

/**
 * Validate date format
 * @param {string} date - Date string
 * @returns {boolean}
 */
export function validateDate(date) {
  if (!date) return false
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  return dateRegex.test(date)
}

/**
 * Validate slug format
 * @param {string} slug - URL slug
 * @returns {boolean}
 */
export function validateSlug(slug) {
  if (!slug) return false
  return /^[a-z0-9-]+$/.test(slug)
}

/**
 * Sanitize venue address
 * @param {string} address - Raw address
 * @returns {string}
 */
export function sanitizeVenueAddress(address) {
  if (!address) return ''

  return String(address)
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove script protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 200) // Limit to reasonable length
}

/**
 * Validate band name
 * @param {string} name - Band name
 * @returns {string}
 */
export function sanitizeBandName(name) {
  if (!name) return ''
  return sanitizeString(name).substring(0, 100)
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
    if (!band.venue || typeof band.venue !== 'string') {
      return { valid: false, error: 'Each band must have a venue string' }
    }
    if (!band.date || typeof band.date !== 'string') {
      return { valid: false, error: 'Each band must have a date string' }
    }
    if (!band.startTime || typeof band.startTime !== 'string') {
      return { valid: false, error: 'Each band must have a startTime string' }
    }
    if (!band.endTime || typeof band.endTime !== 'string') {
      return { valid: false, error: 'Each band must have an endTime string' }
    }
  }

  return { valid: true }
}
