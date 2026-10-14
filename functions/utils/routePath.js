// Pages matches Function routes case-insensitively, so every path-based decision must compare this, never url.pathname.
export function routePath(urlOrRequest) {
  return new URL(urlOrRequest?.url ?? urlOrRequest).pathname.toLowerCase();
}
