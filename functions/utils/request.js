import { validateId } from "./validation.js";

export function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "unknown"
  );
}

/**
 * Parse a request body when the endpoint expects a JSON object.
 *
 * The bug this exists for: `request.json().catch(() => ({}))` was the standing idiom,
 * and its `.catch` only fires on a PARSE FAILURE. A body of the literal `null` parses
 * perfectly well and resolves to `null`, so the catch never ran and the next line's
 * `body.email` threw a TypeError -- surfacing as an opaque 500 where the right answer
 * is a 400. Arrays and bare scalars parse fine too; they usually landed on a field
 * validation 400 only by accident, because every field read on them yields undefined.
 * Returning null for those valid-but-wrong shapes lets each endpoint reject them with
 * its own existing 400 response.
 *
 * READ THIS BEFORE ASSUMING THIS FUNCTION VALIDATES: a MALFORMED body still resolves
 * to `{}`, not null, and is therefore NOT rejected here. That is deliberate -- it is
 * the pre-existing behaviour of every call site, where a malformed body falls through
 * to field validation, and changing it would be a behavioural change rather than the
 * robustness fix this is. The hazard is that centralising the fallback hides it: the
 * name reads like a validator, so a caller may assume a malformed body cannot reach
 * it. One live consequence is recorded in #978 -- events/[id].js's cascade delete
 * accepts `?confirmCascade=true` from the QUERY STRING, so a malformed body reaches
 * the delete exactly as it did before this helper existed.
 *
 * Returns: the object for a valid object body; `{}` for a malformed body; `null` for
 * a JSON `null`, an array, or a bare scalar. (`null`, not `undefined`: this repo
 * returns null from functions/ by a 63-to-3 margin.)
 */
export async function parseJsonObjectBody(request) {
  const parsed = await request.json().catch(() => ({}));
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

/**
 * The strict sibling of parseJsonObjectBody: returns null for a MALFORMED body as well
 * as for a JSON `null`, an array or a scalar. Only a real object comes back.
 *
 * @param {Request} request - the request whose body is read and consumed
 * @returns {Promise<object|null>} the parsed object, or null for any body that is not one
 *
 * Use this where the endpoint already answered a malformed body with its own explicit
 * 400 rather than letting it fall through to field validation. Those endpoints exist --
 * they wrote `try { await request.json() } catch { return "Invalid JSON body" }` -- and
 * folding them into the lenient helper silently downgraded that answer to whatever
 * field validation said next. It is the same one-parser-per-behaviour split the cookie
 * helpers went through: two documented contracts beat one contract plus an allowlist of
 * endpoints that quietly need the other.
 */
export async function parseJsonObjectBodyStrict(request) {
  try {
    const parsed = await request.json();
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
