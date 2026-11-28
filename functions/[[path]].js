// Catch-all for every path no other Pages Function owns (#1446).
//
// Without it Pages falls back to the SPA's index.html with HTTP 200, so
// /totally-bogus-path was a soft 404 carrying the home page's title. This
// answers a real 404 (with noindex) for unknown paths and lets the SPA's own
// routes through. Specific functions (band/[id].js, event/[slug].js, ...) match
// first; static assets are excluded in frontend/public/_routes.json and never
// reach here.
import { routePath, isApiRoute } from "./utils/routePath.js";
import { isClientOnlyRoute } from "./utils/clientRoutes.js";
import { serveNotFound } from "./utils/ssrMeta.js";
import { onRequestGet as serveHome } from "./index.js";

export async function onRequest(context) {
  const path = routePath(context.request);

  // wrangler (verified 2026-11-01) lets this all-method splat win over index.js's
  // onRequestGet for "/", which 404ed the home page. Dispatch "/" explicitly.
  if (path === "/") return serveHome(context);

  // An /api path no handler owns is a JSON 404, never the SPA shell with 200 (#1491).
  // isApiRoute (not startsWith) so /API/x and encoded spellings get the same answer.
  // OPTIONS never reaches here: _middleware.js answers preflight first.
  if (isApiRoute(context.request)) {
    return new Response(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  if (isClientOnlyRoute(path)) {
    return context.env.ASSETS.fetch(context.request);
  }
  return serveNotFound(context);
}
