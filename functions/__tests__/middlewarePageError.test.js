// A thrown error on a page route must reach a browser as an HTML page, not raw
// JSON. /api/* keeps the JSON body. Path decisions use routePath(), so a
// differently-cased /API/ is still the API.
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../_middleware.js";

const throwingNext = async () => {
  throw new Error("boom");
};

function run(path, accept) {
  const headers = { "CF-Connecting-IP": "127.0.0.1" };
  if (accept) headers.Accept = accept;
  return onRequest({
    request: new Request(`https://settimes.ca${path}`, { headers }),
    env: {},
    next: throwingNext,
  });
}

describe("middleware error responses", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  test("an HTML request to a page route that throws gets an HTML 500 with noindex", async () => {
    const res = await run("/band/5", "text/html,application/xhtml+xml");
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age");
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("Something went wrong on our side. Please try again in a moment.");
    expect(html).toContain('href="/"');
    expect(html).not.toMatch(/<script|style=/i);
  });

  test("a page route that throws for a non-HTML client still gets JSON", async () => {
    const res = await run("/band/5", "application/json");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  test("/api/ requests that throw keep the JSON 500, even when asking for HTML", async () => {
    const res = await run("/api/venues", "text/html");
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  test("/API/ in another case still counts as API", async () => {
    const res = await run("/API/venues", "text/html");
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});
