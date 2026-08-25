// Positive-integer ID validation utilities (single value and arrays).
// Split out of validation.js (#906) — see that file's header for why.

/**
 * Validate a positive integer ID
 * @param {any} id - ID to validate
 * @returns {Object} { valid: boolean, value: number|null, error: string|null }
 */
export function validateId(id) {
  if (id === undefined || id === null || id === "") {
    return { valid: false, error: "ID is required" };
  }

  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 1) {
    return { valid: false, error: "ID must be a positive integer" };
  }

  return { valid: true, value: numId, error: undefined };
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

  return { valid: true, values, error: undefined };
}
