// The gate around the production-data MCP handler. auth.test.js proves
// isAuthorized decides correctly; this file proves nothing reaches the handler
// without it, and that the deployed Worker actually routes through here.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { routeRequest } from "../src/router.js";

const secret = "a".repeat(64);
const env = { SHARED_SECRET: secret };
const call = (path, { method = "POST", authorization } = {}) => {
  const handler = vi.fn(async () => new Response("handled"));
  const headers = authorization === undefined ? {} : { Authorization: authorization };
  const request = new globalThis.Request(`https://mcp.example.com${path}`, { method, headers });
  return routeRequest(request, env, {}, handler).then((response) => ({ response, handler }));
};

describe("routeRequest", () => {
  it.each([
    ["POST /mcp with no header", "/mcp", {}],
    ["POST /mcp with a wrong token", "/mcp", { authorization: `Bearer ${"b".repeat(64)}` }],
    ["an OPTIONS preflight", "/mcp", { method: "OPTIONS" }],
    ["GET /mcp", "/mcp", { method: "GET" }],
    ["a trailing slash", "/mcp/", {}],
    ["another case", "/MCP", {}],
    ["OAuth discovery", "/.well-known/oauth-authorization-server", { method: "GET" }],
  ])("refuses %s with a bare 401 and never calls the handler", async (_name, path, opts) => {
    const { response, handler } = await call(path, opts);
    expect(response.status).toBe(401);
    expect([...response.headers.keys()].filter((h) => h.startsWith("access-control"))).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("404s an authorized request to any other path without calling the handler", async () => {
    const { response, handler } = await call("/mcp/", { authorization: `Bearer ${secret}` });
    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands an authorized /mcp request to the handler", async () => {
    const { response, handler } = await call("/mcp", { authorization: `Bearer ${secret}` });
    expect(await response.text()).toBe("handled");
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("src/index.ts", () => {
  // index.ts imports cloudflare:workers, which Node cannot load, so its fetch
  // is checked as source: it must do nothing but delegate to routeRequest.
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const exported = source.slice(source.indexOf("export default"));

  it("routes every request through routeRequest and nothing else", () => {
    expect(exported).toMatch(
      /fetch\([^)]*\)\s*{\s*(?:\/\/[^\n]*\n\s*)*return routeRequest\(request, env, ctx, handler\);\s*}/,
    );
    expect(source.match(/\bhandler\(/g)).toBeNull();
  });

  it("serves no CORS headers", () => {
    expect(source).toMatch(/createMcpHandler\(createServer, \{[^}]*corsOptions: false[^}]*\}\)/);
  });

  it("marks every tool read-only and closed-world", () => {
    const tools = source.match(/registerTool\(/g) ?? [];
    expect(tools.length).toBe(7);
    expect(source.match(/annotations: READ_ONLY/g) ?? []).toHaveLength(tools.length);
    expect(source).toMatch(/const READ_ONLY = \{ readOnlyHint: true, destructiveHint: false, openWorldHint: false \};/);
  });
});

