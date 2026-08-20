// String sanitization and required-field validation utilities.
// Split out of validation.js (#906) — see that file's header for why.

/**
 * Control characters to remove during sanitization
 * Removes: null bytes (\x00), control characters except tab/newline (\x0B-\x1F), and DEL (\x7F)
 */
// eslint-disable-next-line no-control-regex -- intentional: matches control chars for security sanitization
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitize string input by removing dangerous characters
 * Note: This is a basic sanitization. For HTML content, use DOMPurify on client-side
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeString(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  // Remove null bytes (\x00), control characters except tab/newline (\x0B-\x1F), and DEL (\x7F)
  return input.replace(CONTROL_CHARS_REGEX, "").trim();
}

export function sanitizeOptionalText(value, maxLength, label) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = sanitizeString(String(value));
  if (!text) {
    return null;
  }

  if (maxLength !== undefined && text.length > maxLength) {
    throw new Error(`${label} must be no more than ${maxLength} characters`);
  }

  return text;
}

/**
 * Validate required fields in an object
 * @param {Object} data - Data object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @returns {Object} { valid: boolean, missing: string[] }
 */
export function validateRequiredFields(data, requiredFields) {
  if (!data || typeof data !== "object") {
    return { valid: false, missing: requiredFields };
  }

  const missing = requiredFields.filter((field) => {
    const value = data[field];
    return value === undefined || value === null || value === "";
  });

  return { valid: missing.length === 0, missing };
}
