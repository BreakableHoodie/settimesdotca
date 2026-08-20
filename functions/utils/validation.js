// Input validation utilities for Cloudflare Workers — facade module (#906).
//
// This file used to hold ~1,460 lines and 31 exports directly, and was
// imported by 43 files across functions/. That made it a single point of
// contention for unrelated changes and hard to navigate. The implementation
// has been split into focused sibling modules under
// functions/utils/validation/ (fieldLimits, identity, strings, urls,
// contact, datetime, ids, schema, response), grouped by what they validate.
//
// This file is now a pure re-exporting facade: every name it used to export
// directly, it now re-exports from the module that owns it. Every existing
// `import { X } from "…/utils/validation"` (this file's own path) across the
// codebase keeps working unchanged — nothing outside functions/utils/ should
// ever need to change its import path because of this split.
//
// functions/utils/__tests__/validationPublicSurface.test.js pins the full
// list of 31 export names and their types — run it after touching this file
// or any module it re-exports from.

export { FIELD_LIMITS } from "./validation/fieldLimits.js";
export { isValidEmail, validatePassword, isValidUUID, isValidRole } from "./validation/identity.js";
export { sanitizeString, sanitizeOptionalText, validateRequiredFields } from "./validation/strings.js";
export {
  normalizeHttpUrl,
  safeReflectHandleOrUrl,
  safeReflectSocialLinks,
  safeReflectSocialLinksString,
  sanitizeOptionalHttpUrl,
  sanitizeBandSocialLinks,
  sanitizeEventSocialLinks,
  sanitizeVenueInfo,
  isValidURL,
} from "./validation/urls.js";
export { isValidPhone, isValidPostalCode, normalizePostalCode } from "./validation/contact.js";
export {
  isValidISODate,
  isValidTime,
  validateSetTimes,
  validateDate,
  validatePerformanceDate,
  validateDoorsJson,
} from "./validation/datetime.js";
export { validateId, validateIdArray } from "./validation/ids.js";
export { validateEntity, VALIDATION_SCHEMAS } from "./validation/schema.js";
export { validationErrorResponse } from "./validation/response.js";
