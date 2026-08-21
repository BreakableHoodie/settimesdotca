// Phone number and postal code validation/normalization utilities.
// Split out of validation.js (#906) — see that file's header for why.
//
// POSTAL_CODE_REGEX and PHONE_REGEX are exported (not just used locally)
// because functions/utils/validation/schema.js's VALIDATION_SCHEMAS.venue
// reuses them as field `pattern`s — a single source of truth for both the
// standalone isValidPhone/isValidPostalCode checks and the schema engine.

/**
 * Postal code regex (supports US ZIP and Canadian postal codes)
 */
export const POSTAL_CODE_REGEX = /^(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d)$/;

/**
 * Phone number regex (permissive, digits + formatting)
 */
export const PHONE_REGEX = /^\+?[\d\s().-]{7,20}$/;

/**
 * Validate phone number format (permissive)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid or empty
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== "string") {
    return true;
  }
  return PHONE_REGEX.test(phone.trim());
}

/**
 * Validate postal code format (US ZIP or Canadian postal)
 * @param {string} postalCode - Postal code to validate
 * @returns {boolean} True if valid or empty
 */
export function isValidPostalCode(postalCode) {
  if (!postalCode || typeof postalCode !== "string") {
    return true;
  }
  return POSTAL_CODE_REGEX.test(postalCode.trim());
}

/**
 * Normalize postal code to standard format
 * Canadian: "A1A 1A1" (uppercase, single space)
 * US: "12345" or "12345-6789" (trimmed)
 * @param {string} postalCode - Raw postal code
 * @returns {string|null} Normalized postal code or null if empty
 */
export function normalizePostalCode(postalCode) {
  if (!postalCode || typeof postalCode !== "string") {
    return null;
  }

  const trimmed = postalCode.trim().toUpperCase();
  if (!trimmed) return null;

  // Check for Canadian format (A1A 1A1 or A1A1A1)
  // Remove all whitespace/separators to check the raw alphanumeric sequence
  const clean = trimmed.replace(/[\s\u00A0-]+/g, ""); // Remove spaces, nbsp, hyphens usually not in CA code

  // Canadian: 6 chars, Letter-Digit-Letter Digit-Letter-Digit
  if (clean.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(clean)) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }

  // If not identified as Canadian, return the trimmed original (handles US zip)
  return trimmed;
}
