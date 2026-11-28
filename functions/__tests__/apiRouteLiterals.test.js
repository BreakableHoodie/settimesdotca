// Guard (#1491): an unknown /api path is now a JSON 404, so a client that calls
// an /api URL no handler owns would break loudly instead of silently reading the
// SPA shell. This scans the callers' source (frontend, e2e, scripts) for /api/
// string literals and requires each to resolve to a handler file under
// functions/api/, using Pages routing: name.js, dir/index.js, [param].js (one
// segment), [[param]].js (one or more). `${...}` stands for any one segment.
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");

function handlerRoutes(dir, prefix = "/api") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__" || e.name.startsWith("_") || e.name === "test-utils.js") continue;
    if (e.isDirectory()) out.push(...handlerRoutes(path.join(dir, e.name), `${prefix}/${e.name}`));
    else if (e.name.endsWith(".js")) {
      const base = e.name.slice(0, -3);
      out.push(base === "index" ? prefix : `${prefix}/${base}`);
    }
  }
  return out;
}

export function resolves(literal, routes) {
  const segs = literal.split("/");
  return routes.some((route) => {
    const rs = route.split("/");
    for (let i = 0; i < rs.length; i++) {
      if (/^\[\[.+\]\]$/.test(rs[i])) return segs.length > i; // catch-all: one or more
      if (segs[i] === undefined) return false;
      if (!(/^\[.+\]$/.test(rs[i]) ? segs[i] !== "" : rs[i] === segs[i])) return false;
    }
    return rs.length === segs.length;
  });
}

// Literals: a quote, then /api/..., up to the closing quote, ?, # or whitespace.
// Each ${...} becomes "x"; a literal ending in "/" is a prefix a variable completes.
// A file-level `const API_BASE = "/api/admin"` is a base, not a call: its uses
// (`${API_BASE}/bands`) are expanded and checked instead.
export function apiLiterals(src) {
  const out = [];
  for (const b of src.matchAll(/\bconst\s+(\w+)\s*=\s*["'`](\/api(?:\/[^"'`$]*)?)["'`]/g)) {
    src = src.replace(b[0], "").replaceAll("${" + b[1] + "}", b[2]);
  }
  for (const m of src.matchAll(/["'`](\/api\/[^"'`?#:\s]*)/g)) {
    let lit = m[1].replace(/\$\{[^}]*\}?/g, "x");
    if (lit.endsWith("/")) lit += "x";
    out.push(lit);
  }
  return out;
}

// Deliberately unowned: the smoke probe asserts this path answers a JSON 404.
const INTENTIONALLY_UNKNOWN = new Set(["/api/zzz-nope"]);

function sourceFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "__tests__", "test", "dist"].includes(e.name) || e.name === "mutation-gate.mjs") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

describe("every /api literal in a caller resolves to a handler file (#1491)", () => {
  const routes = handlerRoutes(path.join(root, "functions/api"));

  test("the resolver itself: known-good and bogus literals", () => {
    expect(resolves("/api/events/timeline", routes)).toBe(true);
    expect(resolves("/api/bands/x", routes)).toBe(true);
    expect(resolves("/api/bands", routes)).toBe(false); // directory with no bands.js
    expect(resolves("/api/zzz-nope", routes)).toBe(false);
    expect(apiLiterals("fetch(`/api/events/${id}/details?x=1`)")).toEqual(["/api/events/x/details"]);
    expect(apiLiterals('fetch("/api/admin/bands/" + id)')).toEqual(["/api/admin/bands/x"]);
    expect(apiLiterals("const B = '/api/admin'; f(`${B}/zzz`)")).toEqual(["/api/admin/zzz"]);
  });

  test("frontend, e2e and scripts only call routes that exist", () => {
    const files = ["frontend/src", "e2e", "scripts"].flatMap((d) => sourceFiles(path.join(root, d)));
    expect(files.length).toBeGreaterThan(50);
    const seen = new Set();
    const unresolved = [];
    for (const file of files) {
      for (const lit of apiLiterals(readFileSync(file, "utf8"))) {
        const key = `${path.relative(root, file)} ${lit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!INTENTIONALLY_UNKNOWN.has(lit) && !resolves(lit, routes)) unresolved.push(key);
      }
    }
    expect(unresolved, `no handler under functions/api/ for:\n${unresolved.join("\n")}`).toEqual([]);
  });
});
