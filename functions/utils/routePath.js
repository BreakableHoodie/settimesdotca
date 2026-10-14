// Pages matches Function routes case-insensitively and ignores trailing slashes, so every path-based decision must compare this, never url.pathname.
export function routePath(urlOrRequest) {
  const path = new URL(urlOrRequest?.url ?? urlOrRequest).pathname.toLowerCase();
  return path.replace(/\/+$/, "") || "/";
}
