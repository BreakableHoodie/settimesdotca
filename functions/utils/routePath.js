// Pages matches Function routes case-insensitively and ignores trailing slashes, so every path-based decision must compare this, never url.pathname.
export function routePath(urlOrRequest) {
  const path = new URL(urlOrRequest?.url ?? urlOrRequest).pathname.toLowerCase();
  return trimTrailingSlashes(path);
}

// A loop, not /\/+$/: that regex is quadratic on a long run of slashes not at the end
// ("/" x 16000 + "x" costs ~110 ms of CPU), and this runs before authentication.
export function trimTrailingSlashes(path) {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  return path.slice(0, end) || "/";
}
