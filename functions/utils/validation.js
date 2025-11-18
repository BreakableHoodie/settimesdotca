// Input validation utilities for Cloudflare Workers
// Provides reusable validation functions for API endpoints

/**
 * Email validation regex
 * Improved pattern: prevents consecutive dots and leading dot in domain
 * Matches most common email formats, not fully RFC 5322 compliant
 */
const EMAIL_REGEX = /^[^\s@]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

/**
 * UUID validation regex (RFC 4122 compliant)
 * Validates UUID v1-5 format
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ISO 8601 date format regex
 * Matches YYYY-MM-DD and full ISO datetime formats
 */
const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Valid user roles in the system
 * Update this array when adding new roles
 */
const VALID_ROLES = ["admin", "editor", "viewer"];

/**
 * Control characters to remove during sanitization
 * Removes: null bytes (\x00), control characters except tab/newline (\x0B-\x1F), and DEL (\x7F)
 */
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g;

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") {
    return false;
  }
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum length (default: 8)
 * @param {boolean} options.requireUppercase - Require uppercase letter (default: false)
 * @param {boolean} options.requireLowercase - Require lowercase letter (default: false)
 * @param {boolean} options.requireNumber - Require number (default: false)
 * @param {boolean} options.requireSpecial - Require special character (default: false)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validatePassword(password, options = {}) {
  const {
    minLength = 8,
    requireUppercase = false,
    requireLowercase = false,
    requireNumber = false,
    requireSpecial = false,
  } = options;

  const errors = [];

  if (!password || typeof password !== "string") {
    errors.push("Password is required");
    return { valid: false, errors };
  }

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (requireNumber && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Matches any character that is NOT alphanumeric (letters or numbers)
  // This includes symbols, punctuation, and special characters
  if (requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return { valid: errors.length === 0, errors };
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

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum length
 * @param {number} options.max - Maximum length
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateLength(value, options = {}) {
  const { min, max } = options;

  if (typeof value !== "string") {
    return { valid: false, error: "Value must be a string" };
  }

  if (min !== undefined && value.length < min) {
    return { valid: false, error: `Must be at least ${min} characters` };
  }

  if (max !== undefined && value.length > max) {
    return { valid: false, error: `Must be no more than ${max} characters` };
  }

  return { valid: true, error: null };
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid UUID format
 */
export function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== "string") {
    return false;
  }
  return UUID_REGEX.test(uuid);
}

/**
 * Validate role value
 * @param {string} role - Role to validate
 * @returns {boolean} True if valid role
 */
export function isValidRole(role) {
  if (!role || typeof role !== "string") {
    return false;
  }
  return VALID_ROLES.includes(role);
}

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

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate date string (ISO 8601 format)
 * Strictly validates ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO date format
 */
export function isValidISODate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return false;
  }

  // First check if format matches ISO 8601
  if (!ISO_DATE_REGEX.test(dateString)) {
    return false;
  }

  // Then verify it's a valid date that can be parsed
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Create a validation error response
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {number} status - HTTP status code (default: 400)
 * @returns {Response} Error response
 */
export function validationErrorResponse(message, details = {}, status = 400) {
  return new Response(
    JSON.stringify({
      error: "Validation error",
      message,
      ...details,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}
