// Pages matches Function routes case-insensitively and ignores trailing slashes, so every path-based decision must compare this, never url.pathname.
export function routePath(urlOrRequest) {
  const path = new URL(urlOrRequest?.url ?? urlOrRequest).pathname.toLowerCase();
  return trimTrailingSlashes(path);
}

// Is this the API? Compared on the normalised path because the `/*` include in
// _routes.json sends /API/... to Functions as well (#1446), and an API request
// taking the page branch would skip CORS, rate limits, the body-size guard, the
// FK pragma and the API CSP.
//
// It fails closed: repeated slashes are collapsed and percent-encoding decoded
// before the test, so a router that normalises "//api/x" or "/%61pi/x" more
// generously than this check cannot hand the API a request that skipped its
// protections. A path that will not decode is treated as the API (the stricter
// branch). Local wrangler routes neither form to an API handler (verified
// 2026-11-01); this does not depend on that.
export function isApiRoute(urlOrRequest) {
  let path = routePath(urlOrRequest).replace(/\/{2,}/g, "/");
  try {
    path = decodeURIComponent(path)
      .toLowerCase()
      .replace(/\/{2,}/g, "/");
  } catch {
    return true;
  }
  return path === "/api" || path.startsWith("/api/");
}

// A loop, not /\/+$/: that regex is quadratic on a long run of slashes not at the end
// ("/" x 16000 + "x" costs ~110 ms of CPU), and this runs before authentication.
export function trimTrailingSlashes(path) {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  return path.slice(0, end) || "/";
}
