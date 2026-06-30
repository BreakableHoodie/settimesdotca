// publicUrl.js — safe base-URL resolution for security-bearing emails
//
// The only safe source for the public base URL is a server-side environment
// variable. Deriving it from request.url (or the Host header) lets an attacker
// send a victim a password-reset link pointing at an attacker-controlled host
// (reset-link / Host-header poisoning).
//
// Usage:
//   import { getPublicBaseUrl } from "../../utils/publicUrl.js";
//   const baseUrl = getPublicBaseUrl(env);

const PROD_BASE_URL = "https://settimes.ca";

/**
 * Returns the public base URL to use in outbound security-bearing links
 * (password-reset, activation, invite, verification).
 *
 * Prefers env.PUBLIC_URL when set and non-empty. Falls back to the hardcoded
 * production default — NEVER to request.url — so the link host is never
 * attacker-controllable via the Host header.
 *
 * @param {object} env  Cloudflare Workers env binding
 * @returns {string}    Base URL with no trailing slash
 */
export function getPublicBaseUrl(env) {
  const url = env?.PUBLIC_URL?.trim();
  if (url) {
    return url.replace(/\/+$/, "");
  }
  // PUBLIC_URL is documented as required in production. If it is unset the
  // runtime is mis-configured; log a warning so ops can detect and fix it.
  // We still return the safe prod default so the flow continues rather than
  // crashing — but crucially, the host is never derived from the request.
  console.warn(
    "[publicUrl] PUBLIC_URL is unset; falling back to the safe production default. Set PUBLIC_URL in the environment.",
  );
  return PROD_BASE_URL;
}
