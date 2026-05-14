// Password reset endpoints
// POST /api/auth/reset-password — consume token and set new password
// POST /api/auth/reset-password/validate — validate token (accepts token in body)
//
// Token validation moved to /api/auth/reset-password/validate (POST) so the token
// is never exposed in URL query strings, access logs, or browser history.

export { onRequestPost } from "./reset-password-complete.js";

// GET is no longer supported — return 405 to prevent accidental token exposure
// via query string logging. Clients should POST to /api/auth/reset-password/validate.
export async function onRequestGet(_context) {
  return new Response(
    JSON.stringify({
      error: "Method not allowed",
      message: "Token validation has moved to POST /api/auth/reset-password/validate",
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "POST",
      },
    },
  );
}
