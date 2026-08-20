// Standard validation-error HTTP response helper.
// Split out of validation.js (#906) — see that file's header for why.

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
