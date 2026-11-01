// Soft-404 guard (#1446): a URL whose entity or path definitely does not exist
// answers 404 + noindex through serveNotFound; a transient error or a closed
// public-data gate keeps serving the shell; real client routes stay 200.
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest as venueHandler } from "../venue/[id].js";
import { onRequest as eventHandler } from "../event/[slug].js";
import { onRequest as catchAll } from "../[[path]].js";
import { serveNotFound } from "../utils/ssrMeta.js";
import { isClientOnlyRoute } from "../utils/clientRoutes.js";
import { createTestEnv } from "../api/test-utils.js";

const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes home</title>
  </head><body><div id="root"></div></body></html>`;

function ctx(env, url, params = {}) {
  env.ASSETS = {
    fetch: async () =>
      new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html", "x-frame-options": "DENY" } }),
  };
  return { request: new Request(url), env, params };
}

async function expectSoft404Fixed(response) {
  const html = await response.text();
  expect(response.status).toBe(404);
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).toContain("<title>Page not found | SetTimes</title>");
  expect(html).not.toContain("Homepage description");
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
}

const brokenDb = {
  prepare: () => ({
    bind: () => ({
      first: async () => {
        throw new Error("D1_ERROR");
      },
    }),
  }),
};

describe("serveNotFound", () => {
  test("a shell fetch failure is a plain-text 404, never a 200", async () => {
    const response = await serveNotFound({
      request: new Request("https://settimes.ca/x"),
      env: {
        ASSETS: {
          fetch: async () => {
            throw new Error("assets down");
          },
        },
      },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });
});

describe("venue and event routes", () => {
  test("unknown venue id and non-numeric id answer 404", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    await expectSoft404Fixed(await venueHandler(ctx(env, "https://settimes.ca/venue/99999", { id: "99999" })));
    await expectSoft404Fixed(await venueHandler(ctx(env, "https://settimes.ca/venue/abc", { id: "abc" })));
  });

  test("unknown event slug answers 404", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    await expectSoft404Fixed(
      await eventHandler(ctx(env, "https://settimes.ca/event/no-such-event", { slug: "no-such-event" })),
    );
  });

  test("a DB error serves the shell, not a 404", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const v = ctx(env, "https://settimes.ca/venue/5", { id: "5" });
    v.env.DB = brokenDb;
    expect((await venueHandler(v)).status).toBe(200);
    const e = ctx(env, "https://settimes.ca/event/x", { slug: "x" });
    e.env.DB = brokenDb;
    expect((await eventHandler(e)).status).toBe(200);
  });

  test("a closed public-data gate serves the shell, not a 404", async () => {
    const { env } = createTestEnv();
    expect((await venueHandler(ctx(env, "https://settimes.ca/venue/99999", { id: "99999" }))).status).toBe(200);
    expect((await eventHandler(ctx(env, "https://settimes.ca/event/nope", { slug: "nope" }))).status).toBe(200);
  });
});

describe("functions/[[path]].js catch-all", () => {
  test("unknown paths answer 404 with noindex", async () => {
    const { env } = createTestEnv();
    await expectSoft404Fixed(await catchAll(ctx(env, "https://settimes.ca/totally-bogus-path")));
    await expectSoft404Fixed(await catchAll(ctx(env, "https://settimes.ca/events/nope")));
  });

  test("client-only routes (any case, trailing slash) get the shell with 200", async () => {
    const { env } = createTestEnv();
    for (const p of ["/embed/lwbc18", "/Embed/lwbc18/", "/reset-password", "/activate", "/admin", "/admin/login"]) {
      const response = await catchAll(ctx(env, `https://settimes.ca${p}`));
      expect(response.status, p).toBe(200);
      expect(await response.text(), p).toBe(STUB_HTML);
    }
  });

  test("/api/ paths are passed through unchanged", async () => {
    const { env } = createTestEnv();
    const response = await catchAll(ctx(env, "https://settimes.ca/api/whatever"));
    expect(response.status).toBe(200);
  });
});

// Source scan: a <Route path> added to main.jsx must be served by a function
// file or be in CLIENT_ONLY_ROUTES, or the catch-all 404s it for real visitors.
describe("every client route is reachable (not swallowed by the catch-all)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(here, "../..");
  const fnDir = path.join(root, "functions");

  function functionRoutes(dir, prefix = "") {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["__tests__", "api", "utils", "scheduled"].includes(entry.name)) continue;
      if (entry.isDirectory()) out.push(...functionRoutes(path.join(dir, entry.name), `${prefix}/${entry.name}`));
      else if (entry.name.endsWith(".js") && !entry.name.startsWith("_") && !entry.name.startsWith("[[")) {
        const base = entry.name.slice(0, -3);
        out.push(base === "index" ? prefix || "/" : `${prefix}/${base}`);
      }
    }
    return out;
  }

  function matchesFunction(clientPath, fnRoutes) {
    const concrete = clientPath.replace(/:[A-Za-z]+/g, "x");
    const segs = concrete.split("/");
    return fnRoutes.some((route) => {
      const rs = route.split("/");
      return rs.length === segs.length && rs.every((r, i) => (/^\[.+\]$/.test(r) ? segs[i] !== "" : r === segs[i]));
    });
  }

  test("main.jsx routes are each owned by a function or the client-only list", () => {
    const main = readFileSync(path.join(root, "frontend/src/main.jsx"), "utf8");
    const routes = [...main.matchAll(/\bRoute\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
    expect(routes.length).toBeGreaterThan(10);
    const fnRoutes = functionRoutes(fnDir);
    const orphans = routes.filter((p) => {
      const concrete = p.replace(/:[A-Za-z]+/g, "x").replace(/\/\*$/, "/x");
      return !matchesFunction(p, fnRoutes) && !isClientOnlyRoute(concrete);
    });
    expect(orphans, `route(s) the catch-all would 404: ${orphans.join(", ")}`).toEqual([]);
  });

  test("every file in frontend/public is excluded from the Functions or owned by one", () => {
    const routes = JSON.parse(readFileSync(path.join(root, "frontend/public/_routes.json"), "utf8"));
    const fnRoutes = functionRoutes(fnDir);
    const files = [];
    const walk = (dir, prefix = "") => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}/${e.name}`);
        else files.push(`${prefix}/${e.name}`);
      }
    };
    walk(path.join(root, "frontend/public"));
    // Pages 308s /x.html to /x, and sw.js precaches /offline: check that URL too.
    for (const f of [...files]) if (f.endsWith(".html")) files.push(f.slice(0, -5));
    const globToRe = (g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    const excluded = routes.exclude.map(globToRe);
    const unserved = files.filter(
      (f) =>
        !["/_headers", "/_routes.json"].includes(f) &&
        !excluded.some((re) => re.test(f)) &&
        !fnRoutes.includes(f.replace(/\.xml$/, ".xml")),
    );
    // sitemap.xml is owned by functions/sitemap.xml.js
    expect(unserved.filter((f) => f !== "/sitemap.xml")).toEqual([]);
  });
});

describe("catch-all and the home page", () => {
  test("/ is served by index.js, never 404ed by the splat", async () => {
    const { env } = createTestEnv();
    const response = await catchAll(ctx(env, "https://settimes.ca/"));
    expect(response.status).toBe(200);
  });
});

describe("HEAD on GET-only page functions", () => {
  test("every non-API function exporting onRequestGet also exports onRequestHead (or onRequest)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fnDir = path.join(here, "..");
    const bad = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!["__tests__", "api", "utils"].includes(e.name)) walk(full);
        } else if (e.name.endsWith(".js") && !e.name.startsWith("_")) {
          const src = readFileSync(full, "utf8");
          const get = /export\s+(const|async function|function)\s+onRequestGet\b|export\s*\{[^}]*\bonRequestGet\b/.test(
            src,
          );
          const head =
            /\bonRequestHead\b|export\s+(const|async function|function)\s+onRequest\b|export\s*\{[^}]*\bonRequest\b/.test(
              src,
            );
          if (get && !head) bad.push(path.relative(fnDir, full));
        }
      }
    };
    walk(fnDir);
    expect(bad, `HEAD would fall to the catch-all and 404: ${bad.join(", ")}`).toEqual([]);
  });
});
