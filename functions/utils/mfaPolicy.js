// Which roles must have two-factor authentication before they can use the
// admin area (#1253, owner decision 2026-10-14: admins and editors; optional
// for viewers). Editors can change the public schedule and cancel sets
// mid-show, so a stolen editor password does real damage. PBKDF2 is capped at
// 100,000 iterations on Workers, so the password alone carries less of the
// load than OWASP assumes; mandatory TOTP is the compensating control.
const MFA_REQUIRED_ROLES = new Set(["admin", "editor"]);

export function mfaRequiredForRole(role) {
  return typeof role === "string" && MFA_REQUIRED_ROLES.has(role);
}

// The only admin routes a session without required 2FA may reach: enough to
// load the current user and enrol. Logout lives under /api/admin/auth/, which
// the middleware handles before any session check. Compared against
// routePath(), never the raw pathname.
export const MFA_ENROLMENT_ROUTES = new Set([
  "/api/admin/me",
  "/api/admin/mfa/status",
  "/api/admin/mfa/setup",
  "/api/admin/mfa/enable",
]);
