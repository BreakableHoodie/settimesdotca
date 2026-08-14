import { validateId } from "./validation.js";

export function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "unknown"
  );
}

/**
 * Extract the id segment that follows a path segment and run it through
 * validateId(). Returns the validateId() result plus the raw segment so
 * callers that special-case non-numeric ids (e.g. "profile_" band ids)
 * still have access to the original string.
 */
export function getUrlId(request, segment) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf(segment) + 1;
  const rawId = parts[idIndex];
  return { rawId, ...validateId(rawId) };
}
