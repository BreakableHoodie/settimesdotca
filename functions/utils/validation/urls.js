// URL and social-link sanitization utilities: normalizing, validating, and
// safely reflecting stored handle/URL values. Split out of validation.js
// (#906) — see that file's header for why.

import { FIELD_LIMITS } from "./fieldLimits.js";
import { sanitizeString, sanitizeOptionalText } from "./strings.js";

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

function sanitizeOptionalHandle(value, maxLength, label) {
  const text = sanitizeOptionalText(value, maxLength, label);
  if (!text) {
    return null;
  }

  if (/\s/.test(text)) {
    throw new Error(`${label} must not contain spaces`);
  }

  // A handle is a bare @name — it must never carry a URL scheme (javascript:,
  // data:, etc.) or path separators. Legitimate Instagram/X/TikTok handles
  // never contain these characters, so any occurrence means the field is
  // being used to smuggle a URL/scheme past the handle-only contract.
  if (/[:/\\]/.test(text)) {
    throw new Error(`${label} must not contain a URL scheme or path separator`);
  }

  return text;
}

function parseJsonInput(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  }

  if (typeof value === "object") {
    return value;
  }

  throw new Error(`${label} must be valid JSON`);
}

function sanitizeOptionalHandleOrUrl(value, maxLength, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const text = sanitizeString(String(value));
  if (!text) {
    return null;
  }

  if (/^https?:\/\//i.test(text)) {
    return sanitizeOptionalHttpUrl(text, maxLength, label);
  }

  return sanitizeOptionalHandle(text, maxLength, label);
}

/**
 * Query params stripped from every stored URL.
 *
 * From AGENTS.md's clean-links doctrine, which names this exact list:
 * `si`, `dlsi`, `nd`, `utm_*`, `from`. Exported so the guard test can assert
 * the implementation against the doctrine rather than against a copy of it.
 *
 * `si` is what Spotify's and YouTube's own share buttons append, so this fires
 * on the DEFAULT paste, not an edge case.
 *
 * Anything not listed is preserved deliberately — `?t=120` on a YouTube link is
 * a timestamp the artist chose, not tracking.
 */
export const TRACKING_PARAMS = new Set(["si", "dlsi", "nd", "from"]);

/** `utm_source`, `utm_medium`, and friends — matched by prefix, not enumerated. */
export const TRACKING_PARAM_PREFIXES = ["utm_"];

function isTrackingParam(name) {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Remove tracking params in place. Mutating the URL's own searchParams keeps
 * every other part of the URL — path, hash, remaining query order — untouched.
 */
function stripTrackingParams(parsed) {
  for (const name of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(name)) {
      parsed.searchParams.delete(name);
    }
  }
  return parsed;
}

export function normalizeHttpUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return stripTrackingParams(parsed).toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize a stored handle-or-URL value for safe reflection in an API
 * response. This is a read-path counterpart to `sanitizeOptionalHandleOrUrl`
 * (the write-path validator) — it exists because rows written before the
 * write-path guard existed (or written by a bypassed/legacy path) may still
 * contain unsafe scheme values like `javascript:alert(1)` in the DB. Never
 * reflect those verbatim.
 *
 * - Trimmed first, matching the write-path sanitizers, so a legacy value
 *   with stray whitespace (" https://example.com") is recovered as a URL
 *   instead of falling to the handle branch and being dropped. Trimming
 *   cannot launder a scheme: a trimmed "javascript:…" still carries the
 *   colon and is rejected below.
 * - http(s):// values are re-validated/normalized via `normalizeHttpUrl`.
 * - Anything else is treated as a bare handle. A colon is the necessary
 *   condition for any URL scheme (javascript:, data:, vbscript:, …), so a
 *   handle containing one is rejected. Deliberately lenient on slashes so
 *   quirky legacy handles like "instagram.com/band" aren't dropped.
 *
 * @param {*} value - Raw stored value
 * @returns {string|null} Safe value to reflect, or null
 */
export function safeReflectHandleOrUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (!text) {
    return null;
  }

  if (/^https?:\/\//i.test(text)) {
    return normalizeHttpUrl(text);
  }

  return text.includes(":") ? null : text;
}

/**
 * Sanitize a stored social-links JSON string for safe reflection in an API
 * response. Parses the JSON defensively (malformed JSON → `{}`) and routes
 * each field through the appropriate read-path sanitizer: handle fields via
 * `safeReflectHandleOrUrl`, everything else via `normalizeHttpUrl`.
 *
 * @param {string} jsonString - Raw `social_links` column value
 * @param {string[]} handleFields - Keys that hold handles rather than URLs
 * @returns {Object} Plain object of sanitized values
 */
export function safeReflectSocialLinks(jsonString, handleFields = ["instagram"]) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(parsed)) {
    sanitized[key] = handleFields.includes(key) ? safeReflectHandleOrUrl(value) : normalizeHttpUrl(value);
  }

  return sanitized;
}

/**
 * String-in/string-out wrapper around `safeReflectSocialLinks`, for admin
 * read endpoints (#493) that reflect `social_links` as a raw JSON string —
 * the admin frontend (RosterTab.jsx, EventFormModal.jsx, LineupTab.jsx,
 * admin/utils/pickerFormData.js) parses that string itself, so the response
 * shape must stay a string rather than switching to a parsed object.
 *
 * A `null`/`undefined` column value (no social links set) is passed through
 * unchanged rather than coerced to `"{}"`, so callers that never had a
 * `social_links` value don't see one appear in the response.
 *
 * @param {string|null|undefined} jsonString - Raw `social_links` column value
 * @param {string[]} handleFields - Keys that hold handles rather than URLs
 * @returns {string|null|undefined} Sanitized JSON string, or the original
 *   nullish value
 */
export function safeReflectSocialLinksString(jsonString, handleFields = ["instagram"]) {
  if (jsonString === null || jsonString === undefined) {
    return jsonString;
  }
  return JSON.stringify(safeReflectSocialLinks(jsonString, handleFields));
}

export function sanitizeOptionalHttpUrl(value, maxLength = FIELD_LIMITS.url.max, label = "URL") {
  const text = sanitizeOptionalText(value, maxLength, label);
  if (!text) {
    return null;
  }

  const normalized = normalizeHttpUrl(text);
  if (!normalized) {
    throw new Error(`${label} must start with http:// or https://`);
  }

  return normalized;
}

export function sanitizeBandSocialLinks(value) {
  const parsed = parseJsonInput(value, "Social links");
  if (!parsed) {
    return null;
  }

  if (Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Social links must be a JSON object");
  }

  const sanitized = {
    website: sanitizeOptionalHttpUrl(parsed.website, FIELD_LIMITS.bandUrl.max, "Website URL"),
    instagram: sanitizeOptionalHandleOrUrl(parsed.instagram, FIELD_LIMITS.socialHandle.max, "Instagram"),
    bandcamp: sanitizeOptionalHttpUrl(parsed.bandcamp, FIELD_LIMITS.bandUrl.max, "Bandcamp URL"),
    facebook: sanitizeOptionalHttpUrl(parsed.facebook, FIELD_LIMITS.bandUrl.max, "Facebook URL"),
    youtube: sanitizeOptionalHttpUrl(parsed.youtube, FIELD_LIMITS.bandUrl.max, "YouTube URL"),
    spotify: sanitizeOptionalHttpUrl(parsed.spotify, FIELD_LIMITS.bandUrl.max, "Spotify URL"),
    apple_music: sanitizeOptionalHttpUrl(parsed.apple_music, FIELD_LIMITS.bandUrl.max, "Apple Music URL"),
    linktree: sanitizeOptionalHttpUrl(parsed.linktree, FIELD_LIMITS.bandUrl.max, "Linktree URL"),
  };

  return Object.values(sanitized).some(Boolean) ? JSON.stringify(sanitized) : null;
}

export function sanitizeEventSocialLinks(value) {
  const parsed = parseJsonInput(value, "Social links");
  if (!parsed) {
    return null;
  }

  if (Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Social links must be a JSON object");
  }

  const sanitized = {
    website: sanitizeOptionalHttpUrl(parsed.website, FIELD_LIMITS.ticketLink.max, "Website URL"),
    instagram: sanitizeOptionalHandleOrUrl(parsed.instagram, FIELD_LIMITS.ticketLink.max, "Instagram"),
    facebook: sanitizeOptionalHttpUrl(parsed.facebook, FIELD_LIMITS.ticketLink.max, "Facebook URL"),
    x: sanitizeOptionalHandleOrUrl(parsed.x, FIELD_LIMITS.ticketLink.max, "X / Twitter"),
    tiktok: sanitizeOptionalHandleOrUrl(parsed.tiktok, FIELD_LIMITS.ticketLink.max, "TikTok"),
    youtube: sanitizeOptionalHttpUrl(parsed.youtube, FIELD_LIMITS.ticketLink.max, "YouTube URL"),
    bandcamp: sanitizeOptionalHttpUrl(parsed.bandcamp, FIELD_LIMITS.ticketLink.max, "Bandcamp URL"),
  };

  return Object.values(sanitized).some(Boolean) ? JSON.stringify(sanitized) : null;
}

export function sanitizeVenueInfo(value) {
  const parsed = parseJsonInput(value, "Venue info");
  if (!parsed) {
    return null;
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Venue info must be a JSON array");
  }

  const sanitizedVenues = parsed.map((venue, index) => {
    if (!venue || typeof venue !== "object" || Array.isArray(venue)) {
      throw new Error(`Venue ${index + 1} must be a JSON object`);
    }

    const name = sanitizeOptionalText(venue.name, FIELD_LIMITS.venueName.max, `Venue ${index + 1} name`);
    if (!name) {
      throw new Error(`Venue ${index + 1} name is required`);
    }

    return {
      name,
      address: sanitizeOptionalText(venue.address, FIELD_LIMITS.venueAddress.max, `Venue ${index + 1} address`),
      note: sanitizeOptionalText(venue.note, FIELD_LIMITS.shortText.max, `Venue ${index + 1} note`),
      googleMaps: sanitizeOptionalHttpUrl(venue.googleMaps, FIELD_LIMITS.url.max, `Venue ${index + 1} map link`),
    };
  });

  return sanitizedVenues.length > 0 ? JSON.stringify(sanitizedVenues) : null;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidURL(url) {
  return Boolean(normalizeHttpUrl(url));
}
