// Client-only routes: URLs the SPA renders (frontend/src/main.jsx) that NO Pages
// Function owns. functions/[[path]].js answers 404 for every other unmatched
// path (#1446), so a route missing from this list would 404 for real visitors
// and crawlers. functions/__tests__/notFound.test.js fails when a main.jsx <Route path> is
// neither here nor served by a function file.
//
// Matched against routePath() (lower-cased, no trailing slash).
export const CLIENT_ONLY_ROUTES = [/^\/reset-password$/, /^\/activate$/, /^\/embed\/[^/]+$/, /^\/admin(\/.*)?$/];

export function isClientOnlyRoute(path) {
  return CLIENT_ONLY_ROUTES.some((re) => re.test(path));
}
