// Comprehensive entity validation: the generic schema-driven `validateEntity`
// engine plus the pre-defined VALIDATION_SCHEMAS for venue/band/event/user/
// userInvite/inviteCode. Split out of validation.js (#906) — see that file's
// header for why.

import { FIELD_LIMITS } from "./fieldLimits.js";
import { sanitizeString } from "./strings.js";
import { isValidEmail, validatePassword, VALID_ROLES } from "./identity.js";
import { isValidURL, normalizeHttpUrl } from "./urls.js";
import { isValidTime, validateDate } from "./datetime.js";
import { validateId } from "./ids.js";
import { POSTAL_CODE_REGEX, PHONE_REGEX } from "./contact.js";

/**
 * Valid event statuses
 */
const VALID_EVENT_STATUSES = ["draft", "published", "archived"];

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
      // Through the normaliser, not stored raw: this path previously kept
      // tracking params that sanitizeBandSocialLinks strips, so the clean-links
      // doctrine held for band links and failed silently for every generic URL
      // field (ticket links, venue maps, event sites).
      sanitized[field] = trimmedUrl ? normalizeHttpUrl(trimmedUrl) : null;
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
    end_date: {
      type: "date",
      required: false,
      label: "End date",
      default: null,
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
    poster_url: {
      type: "url",
      required: false,
      label: "Poster image",
      max: FIELD_LIMITS.eventPosterUrl.max,
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
    // Schema-level check is deliberately shallow (generic JSON parseability,
    // mirroring venue_info/social_links above) — the real semantic check
    // (date-span + HH:MM shape) is `validateDoorsJson`, called explicitly by
    // the create/update handlers once `date`/`end_date` are known (#569).
    doors_json: {
      type: "string",
      required: false,
      label: "Doors times",
      min: FIELD_LIMITS.eventDoorsJson.min,
      max: FIELD_LIMITS.eventDoorsJson.max,
      validate: (value) => {
        try {
          JSON.parse(value);
          return { valid: true };
        } catch {
          return { valid: false, error: "Doors times must be valid JSON" };
        }
      },
    },
    age_restriction: {
      type: "string",
      required: false,
      label: "Age restriction",
      min: FIELD_LIMITS.eventAgeRestriction.min,
      max: FIELD_LIMITS.eventAgeRestriction.max,
    },
    presented_by: {
      type: "string",
      required: false,
      label: "Presented by",
      min: FIELD_LIMITS.eventPresentedBy.min,
      max: FIELD_LIMITS.eventPresentedBy.max,
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
        return result.valid ? { valid: true } : { valid: false, error: result.errors[0] };
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
