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
 * `null`, not `undefined`, as the invalid-body sentinel: this repo returns null from
 * functions/ by a 63-to-3 margin, so undefined would make this helper the odd one out.
 *
 * @param {Request} request - the request whose body is read and CONSUMED; a Request body
 *   can only be read once, so a caller that needs it again must clone beforehand
 * @returns {Promise<object|null>} the object for a valid object body; `{}` for a
 *   MALFORMED body (not rejected -- see above); `null` for a JSON `null`, an array, or
 *   a bare scalar. Use parseJsonObjectBodyStrict if a malformed body must be rejected.
 */
export async function parseJsonObjectBody(request) {
  const parsed = await request.json().catch(() => ({}));
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

/**
 * The strict sibling of parseJsonObjectBody: returns null for a MALFORMED body as well
 * as for a JSON `null`, an array or a scalar. Only a real object comes back.
 *
 * @param {Request} request - the request whose body is read and CONSUMED (read-once)
 * @returns {Promise<object|null>} the parsed object, or null for any body that is not
 *   one -- INCLUDING a malformed body, which is the sole difference from the lenient helper
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
 * For an endpoint whose body is OPTIONAL but, if sent, must be valid.
 *
 * The distinction the other two helpers cannot make: `{}` means "no body was sent",
 * and that is different from "a body was sent and it is garbage". Both of the others
 * collapse those together -- request.json() throws identically on an empty body and on
 * `{oops`, so the lenient helper answers `{}` to both and the strict one answers null
 * to both. Neither is right here: rejecting the empty case breaks every DELETE that
 * legitimately sends no body, and accepting the malformed case means a destructive
 * request proceeds while silently ignoring a client error.
 *
 * That second half is #978. `DELETE /api/admin/events/:id` takes its cascade
 * confirmation from the body OR the query string, so `?confirmCascade=true` with an
 * unparseable body deleted the event and its performances while discarding the body
 * without a word. The confirmation itself is fine -- a client that puts it in the URL
 * has confirmed -- but a malformed body is a bug in the caller, and the answer to a
 * caller bug on a destructive path is 400, not "proceed and hope".
 *
 * @param {Request} request - the request whose body is read and CONSUMED (read-once)
 * @returns {Promise<object|null>} `{}` when no body was sent (or only whitespace); the
 *   object for a valid object body; `null` when a body WAS sent and is malformed, or
 *   parses to a JSON `null`, an array, or a bare scalar
 */
export async function parseOptionalJsonObjectBody(request) {
  // request.text() rather than request.json(), because an empty body is the case that
  // has to be told apart from a broken one, and json() throws the same way for both.
  const raw = await request.text();
  if (raw.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
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
