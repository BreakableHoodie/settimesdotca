// Identity-related validation utilities: email, password, UUID, and role
// checks. Split out of validation.js (#906) — see that file's header for why.

import { validate as validateEmail } from "email-validator";
import { FIELD_LIMITS } from "./fieldLimits.js";

/**
 * UUID validation regex (RFC 4122 compliant)
 * Validates UUID v1-5 format
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valid user roles in the system
 * Update this array when adding new roles
 */
export const VALID_ROLES = ["admin", "editor", "viewer"];

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
 * @param {number} options.minLength - Minimum length (default: FIELD_LIMITS.password.min)
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
