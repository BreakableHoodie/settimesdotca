// Input validation utilities for Cloudflare Workers
// Provides reusable validation functions for API endpoints

import { validate as validateEmail } from "email-validator";

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
 * Postal code regex (supports US ZIP and Canadian postal codes)
 */
const POSTAL_CODE_REGEX =
  /^(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d)$/;

/**
 * Phone number regex (permissive, digits + formatting)
 */
const PHONE_REGEX = /^\+?[\d\s().-]{7,20}$/;

/**
 * Valid user roles in the system
 * Update this array when adding new roles
 */
const VALID_ROLES = ["admin", "editor", "viewer"];

/**
 * Valid event statuses
 */
const VALID_EVENT_STATUSES = ["draft", "published", "archived"];

/**
 * Control characters to remove during sanitization
 * Removes: null bytes (\x00), control characters except tab/newline (\x0B-\x1F), and DEL (\x7F)
 */
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g;

/**
 * Field length limits - centralized configuration
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
  eventThemeColors: { min: 0, max: 1000 },

  // Generic
  url: { min: 0, max: 2000 },
  shortText: { min: 0, max: 255 },
  longText: { min: 0, max: 10000 },
};

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") {
    return false;
  }
  return validateEmail(email.trim());
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
    minLength = FIELD_LIMITS.password.min,
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

/**
 * Validate time format (HH:MM) and logical validity
 * @param {string} time - Time string to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function isValidTime(time) {
  if (!time || typeof time !== "string") {
    return { valid: false, error: "Time is required" };
  }

  // Check format
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { valid: false, error: "Time must be in HH:MM format" };
  }

  // Check logical validity
  const [hours, minutes] = time.split(":").map(Number);
  if (hours < 0 || hours > 23) {
    return { valid: false, error: "Hours must be between 00 and 23" };
  }
  if (minutes < 0 || minutes > 59) {
    return { valid: false, error: "Minutes must be between 00 and 59" };
  }

  return { valid: true, error: null };
}

/**
 * Validate slug format (URL-friendly)
 * @param {string} slug - Slug to validate
 * @returns {boolean} True if valid slug format
 */
export function isValidSlug(slug) {
  if (!slug || typeof slug !== "string") {
    return false;
  }
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Validate event status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid status
 */
export function isValidEventStatus(status) {
  if (!status || typeof status !== "string") {
    return false;
  }
  return VALID_EVENT_STATUSES.includes(status);
}

/**
 * Validate date string and check if it's a valid calendar date
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Object} { valid: boolean, error: string|null, date: Date|null }
 */
export function validateDate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return { valid: false, error: "Date is required", date: null };
  }

  // Check format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return {
      valid: false,
      error: "Date must be in YYYY-MM-DD format",
      date: null,
    };
  }

  // Parse and validate the date
  const [year, month, day] = dateString.split("-").map(Number);

  // Check year range (reasonable bounds)
  if (year < 2020 || year > 2100) {
    return { valid: false, error: "Year must be between 2020 and 2100", date: null };
  }

  // Check month
  if (month < 1 || month > 12) {
    return { valid: false, error: "Month must be between 01 and 12", date: null };
  }

  // Check day (accounting for month lengths and leap years)
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return {
      valid: false,
      error: `Day must be between 01 and ${daysInMonth} for this month`,
      date: null,
    };
  }

  const date = new Date(dateString);
  return { valid: true, error: null, date };
}

/**
 * Validate a positive integer ID
 * @param {any} id - ID to validate
 * @returns {Object} { valid: boolean, value: number|null, error: string|null }
 */
export function validateId(id) {
  if (id === undefined || id === null || id === "") {
    return { valid: false, value: null, error: "ID is required" };
  }

  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 1) {
    return { valid: false, value: null, error: "ID must be a positive integer" };
  }

  return { valid: true, value: numId, error: null };
}

/**
 * Validate an array of IDs
 * @param {any} ids - Array of IDs to validate
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum array length (default: 100)
 * @returns {Object} { valid: boolean, values: number[]|null, error: string|null }
 */
export function validateIdArray(ids, options = {}) {
  const { maxLength = 100 } = options;

  if (!Array.isArray(ids)) {
    return { valid: false, values: null, error: "Must be an array" };
  }

  if (ids.length === 0) {
    return { valid: false, values: null, error: "Array cannot be empty" };
  }

  if (ids.length > maxLength) {
    return {
      valid: false,
      values: null,
      error: `Array cannot contain more than ${maxLength} items`,
    };
  }

  const values = [];
  for (let i = 0; i < ids.length; i++) {
    const result = validateId(ids[i]);
    if (!result.valid) {
      return {
        valid: false,
        values: null,
        error: `Invalid ID at index ${i}: ${result.error}`,
      };
    }
    values.push(result.value);
  }

  // Check for duplicates
  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length) {
    return { valid: false, values: null, error: "Array contains duplicate IDs" };
  }

  return { valid: true, values, error: null };
}

/**
 * Comprehensive entity validation
 * @param {Object} data - Data to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} { valid: boolean, errors: Object, sanitized: Object }
 */
export function validateEntity(data, schema) {
  const errors = {};
  const sanitized = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Check required
    if (rules.required && (value === undefined || value === null || value === "")) {
      errors[field] = `${rules.label || field} is required`;
      continue;
    }

    // Skip validation for optional empty fields
    if (!rules.required && (value === undefined || value === null || value === "")) {
      sanitized[field] = rules.default !== undefined ? rules.default : null;
      continue;
    }

    // Type validation
    if (rules.type === "string") {
      if (typeof value !== "string") {
        errors[field] = `${rules.label || field} must be a string`;
        continue;
      }

      const sanitizedValue = sanitizeString(value);

      // Length validation
      if (rules.min !== undefined && sanitizedValue.length < rules.min) {
        errors[field] = `${rules.label || field} must be at least ${rules.min} characters`;
        continue;
      }
      if (rules.max !== undefined && sanitizedValue.length > rules.max) {
        errors[field] = `${rules.label || field} must be no more than ${rules.max} characters`;
        continue;
      }

      // Pattern validation
      if (rules.pattern && !rules.pattern.test(sanitizedValue)) {
        errors[field] = rules.patternError || `${rules.label || field} has an invalid format`;
        continue;
      }

      // Custom validation
      if (rules.validate) {
        const result = rules.validate(sanitizedValue);
        if (!result.valid) {
          errors[field] = result.error;
          continue;
        }
      }

      sanitized[field] = sanitizedValue;
    } else if (rules.type === "email") {
      if (typeof value !== "string" || !isValidEmail(value)) {
        errors[field] = `${rules.label || field} must be a valid email address`;
        continue;
      }
      const sanitizedEmail = value.trim().toLowerCase();
      if (rules.min !== undefined && sanitizedEmail.length < rules.min) {
        errors[field] = `${rules.label || field} must be at least ${rules.min} characters`;
        continue;
      }
      if (rules.max !== undefined && sanitizedEmail.length > rules.max) {
        errors[field] = `${rules.label || field} must be no more than ${rules.max} characters`;
        continue;
      }
      sanitized[field] = sanitizedEmail;
    } else if (rules.type === "url") {
      if (typeof value !== "string") {
        errors[field] = `${rules.label || field} must be a string`;
        continue;
      }
      const trimmedUrl = value.trim();
      if (trimmedUrl && !isValidURL(trimmedUrl)) {
        errors[field] = `${rules.label || field} must be a valid URL`;
        continue;
      }
      if (rules.max && trimmedUrl.length > rules.max) {
        errors[field] = `${rules.label || field} must be no more than ${rules.max} characters`;
        continue;
      }
      sanitized[field] = trimmedUrl || null;
    } else if (rules.type === "time") {
      const timeResult = isValidTime(value);
      if (!timeResult.valid) {
        errors[field] = timeResult.error;
        continue;
      }
      sanitized[field] = value;
    } else if (rules.type === "date") {
      const dateResult = validateDate(value);
      if (!dateResult.valid) {
        errors[field] = dateResult.error;
        continue;
      }
      sanitized[field] = value;
    } else if (rules.type === "id") {
      const idResult = validateId(value);
      if (!idResult.valid) {
        errors[field] = idResult.error;
        continue;
      }
      sanitized[field] = idResult.value;
    } else if (rules.type === "enum") {
      if (!rules.values.includes(value)) {
        errors[field] = `${rules.label || field} must be one of: ${rules.values.join(", ")}`;
        continue;
      }
      sanitized[field] = value;
    } else if (rules.type === "boolean") {
      sanitized[field] = Boolean(value);
    } else if (rules.type === "number") {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors[field] = `${rules.label || field} must be a number`;
        continue;
      }
      if (rules.min !== undefined && numValue < rules.min) {
        errors[field] = `${rules.label || field} must be at least ${rules.min}`;
        continue;
      }
      if (rules.max !== undefined && numValue > rules.max) {
        errors[field] = `${rules.label || field} must be no more than ${rules.max}`;
        continue;
      }
      sanitized[field] = numValue;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized,
  };
}

// Pre-defined validation schemas for common entities
export const VALIDATION_SCHEMAS = {
  venue: {
    name: {
      type: "string",
      required: true,
      label: "Venue name",
      min: FIELD_LIMITS.venueName.min,
      max: FIELD_LIMITS.venueName.max,
    },
    address: {
      type: "string",
      required: false,
      label: "Address",
      min: FIELD_LIMITS.venueAddress.min,
      max: FIELD_LIMITS.venueAddress.max,
      default: null,
    },
    address_line1: {
      type: "string",
      required: false,
      label: "Street address",
      min: FIELD_LIMITS.venueAddressLine1.min,
      max: FIELD_LIMITS.venueAddressLine1.max,
      default: null,
    },
    address_line2: {
      type: "string",
      required: false,
      label: "Address line 2",
      min: FIELD_LIMITS.venueAddressLine2.min,
      max: FIELD_LIMITS.venueAddressLine2.max,
      default: null,
    },
    city: {
      type: "string",
      required: false,
      label: "City",
      min: FIELD_LIMITS.venueCity.min,
      max: FIELD_LIMITS.venueCity.max,
      default: null,
    },
    region: {
      type: "string",
      required: false,
      label: "Province/State",
      min: FIELD_LIMITS.venueRegion.min,
      max: FIELD_LIMITS.venueRegion.max,
      default: null,
    },
    postal_code: {
      type: "string",
      required: false,
      label: "Postal code",
      min: FIELD_LIMITS.venuePostal.min,
      max: FIELD_LIMITS.venuePostal.max,
      pattern: POSTAL_CODE_REGEX,
      patternError: "Postal code must be a valid US ZIP or Canadian postal code",
      default: null,
    },
    country: {
      type: "string",
      required: false,
      label: "Country",
      min: FIELD_LIMITS.venueCountry.min,
      max: FIELD_LIMITS.venueCountry.max,
      default: null,
    },
    phone: {
      type: "string",
      required: false,
      label: "Phone",
      min: FIELD_LIMITS.venuePhone.min,
      max: FIELD_LIMITS.venuePhone.max,
      pattern: PHONE_REGEX,
      patternError: "Phone number must contain only digits and formatting characters",
      default: null,
    },
    contact_email: {
      type: "email",
      required: false,
      label: "Contact email",
      min: FIELD_LIMITS.venueContactEmail.min,
      max: FIELD_LIMITS.venueContactEmail.max,
      default: null,
    },
  },

  band: {
    name: {
      type: "string",
      required: true,
      label: "Band name",
      min: FIELD_LIMITS.bandName.min,
      max: FIELD_LIMITS.bandName.max,
    },
    eventId: {
      type: "id",
      required: false,
      label: "Event",
    },
    venueId: {
      type: "id",
      required: false,
      label: "Venue",
    },
    startTime: {
      type: "time",
      required: false,
      label: "Start time",
    },
    endTime: {
      type: "time",
      required: false,
      label: "End time",
    },
    url: {
      type: "url",
      required: false,
      label: "Website URL",
      max: FIELD_LIMITS.bandUrl.max,
    },
    origin: {
      type: "string",
      required: false,
      label: "Origin",
      max: FIELD_LIMITS.bandOrigin.max,
    },
    origin_city: {
      type: "string",
      required: false,
      label: "Origin city",
      max: FIELD_LIMITS.bandOriginCity.max,
    },
    origin_region: {
      type: "string",
      required: false,
      label: "Origin region",
      max: FIELD_LIMITS.bandOriginRegion.max,
    },
    contact_email: {
      type: "email",
      required: false,
      label: "Contact email",
      max: FIELD_LIMITS.bandContactEmail.max,
    },
    genre: {
      type: "string",
      required: false,
      label: "Genre",
      max: FIELD_LIMITS.bandGenre.max,
    },
    description: {
      type: "string",
      required: false,
      label: "Description",
      max: FIELD_LIMITS.bandDescription.max,
    },
    instagram: {
      type: "string",
      required: false,
      label: "Instagram",
      max: FIELD_LIMITS.socialHandle.max,
    },
    bandcamp: {
      type: "url",
      required: false,
      label: "Bandcamp URL",
      max: FIELD_LIMITS.bandUrl.max,
    },
    facebook: {
      type: "url",
      required: false,
      label: "Facebook URL",
      max: FIELD_LIMITS.bandUrl.max,
    },
  },

  event: {
    name: {
      type: "string",
      required: true,
      label: "Event name",
      min: FIELD_LIMITS.eventName.min,
      max: FIELD_LIMITS.eventName.max,
    },
    slug: {
      type: "string",
      required: true,
      label: "Slug",
      min: FIELD_LIMITS.eventSlug.min,
      max: FIELD_LIMITS.eventSlug.max,
      pattern: /^[a-z0-9-]+$/,
      patternError: "Slug must contain only lowercase letters, numbers, and hyphens",
    },
    date: {
      type: "date",
      required: true,
      label: "Date",
    },
    status: {
      type: "enum",
      required: false,
      label: "Status",
      values: VALID_EVENT_STATUSES,
      default: "draft",
    },
    description: {
      type: "string",
      required: false,
      label: "Description",
      min: FIELD_LIMITS.eventDescription.min,
      max: FIELD_LIMITS.eventDescription.max,
    },
    city: {
      type: "string",
      required: false,
      label: "City",
      min: FIELD_LIMITS.eventCity.min,
      max: FIELD_LIMITS.eventCity.max,
    },
    ticket_url: {
      type: "url",
      required: false,
      label: "Ticket link",
      max: FIELD_LIMITS.ticketLink.max,
    },
    venue_info: {
      type: "string",
      required: false,
      label: "Venue info",
      min: FIELD_LIMITS.eventVenueInfo.min,
      max: FIELD_LIMITS.eventVenueInfo.max,
      validate: (value) => {
        try {
          JSON.parse(value);
          return { valid: true };
        } catch {
          return { valid: false, error: "Venue info must be valid JSON" };
        }
      },
    },
    social_links: {
      type: "string",
      required: false,
      label: "Social links",
      min: FIELD_LIMITS.eventSocialLinks.min,
      max: FIELD_LIMITS.eventSocialLinks.max,
      validate: (value) => {
        try {
          JSON.parse(value);
          return { valid: true };
        } catch {
          return { valid: false, error: "Social links must be valid JSON" };
        }
      },
    },
    theme_colors: {
      type: "string",
      required: false,
      label: "Theme colors",
      min: FIELD_LIMITS.eventThemeColors.min,
      max: FIELD_LIMITS.eventThemeColors.max,
      validate: (value) => {
        try {
          JSON.parse(value);
          return { valid: true };
        } catch {
          return { valid: false, error: "Theme colors must be valid JSON" };
        }
      },
    },
  },

  user: {
    email: {
      type: "email",
      required: true,
      label: "Email",
    },
    password: {
      type: "string",
      required: true,
      label: "Password",
      min: FIELD_LIMITS.password.min,
      max: FIELD_LIMITS.password.max,
      validate: (value) => {
        const result = validatePassword(value, {
          minLength: FIELD_LIMITS.password.min,
          requireUppercase: true,
          requireLowercase: true,
          requireNumber: true,
          requireSpecial: true,
        });
        return result.valid
          ? { valid: true }
          : { valid: false, error: result.errors[0] };
      },
    },
    firstName: {
      type: "string",
      required: true,
      label: "First name",
      min: FIELD_LIMITS.userFirstName.min,
      max: FIELD_LIMITS.userFirstName.max,
    },
    lastName: {
      type: "string",
      required: true,
      label: "Last name",
      min: FIELD_LIMITS.userLastName.min,
      max: FIELD_LIMITS.userLastName.max,
    },
    role: {
      type: "enum",
      required: true,
      label: "Role",
      values: VALID_ROLES,
    },
  },
  userInvite: {
    email: {
      type: "email",
      required: true,
      label: "Email",
    },
    firstName: {
      type: "string",
      required: true,
      label: "First name",
      min: FIELD_LIMITS.userFirstName.min,
      max: FIELD_LIMITS.userFirstName.max,
    },
    lastName: {
      type: "string",
      required: true,
      label: "Last name",
      min: FIELD_LIMITS.userLastName.min,
      max: FIELD_LIMITS.userLastName.max,
    },
    role: {
      type: "enum",
      required: true,
      label: "Role",
      values: VALID_ROLES,
    },
  },

  inviteCode: {
    role: {
      type: "enum",
      required: true,
      label: "Role",
      values: VALID_ROLES,
    },
    expiryDays: {
      type: "number",
      required: false,
      label: "Expiry days",
      min: 1,
      max: 365,
      default: 7,
    },
    restrictedEmail: {
      type: "email",
      required: false,
      label: "Restricted email",
    },
  },
};
