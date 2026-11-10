// Catch-all for every path no other Pages Function owns (#1446).
//
// Without it Pages falls back to the SPA's index.html with HTTP 200, so
// /totally-bogus-path was a soft 404 carrying the home page's title. This
// answers a real 404 (with noindex) for unknown paths and lets the SPA's own
// routes through. Specific functions (band/[id].js, event/[slug].js, ...) match
// first; static assets are excluded in frontend/public/_routes.json and never
// reach here.
import { routePath } from "./utils/routePath.js";
import { isClientOnlyRoute } from "./utils/clientRoutes.js";
import { serveNotFound } from "./utils/ssrMeta.js";
import { onRequestGet as serveHome } from "./index.js";

export async function onRequest(context) {
  const path = routePath(context.request);

  // wrangler (verified 2026-11-01) lets this all-method splat win over index.js's
  // onRequestGet for "/", which 404ed the home page. Dispatch "/" explicitly.
  if (path === "/") return serveHome(context);

  // The API keeps whatever it did before; it is not this function's concern.
  if (path.startsWith("/api/") || isClientOnlyRoute(path)) {
    return context.env.ASSETS.fetch(context.request);
  }
  return serveNotFound(context);
}
