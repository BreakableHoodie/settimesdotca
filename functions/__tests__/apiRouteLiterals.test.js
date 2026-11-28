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
import * as acorn from "acorn";
import acornJsx from "acorn-jsx";

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

const JsxParser = acorn.Parser.extend(acornJsx());

function* nodes(node, parent = null) {
  if (!node || typeof node.type !== "string") return;
  yield [node, parent];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === "object") yield* nodes(child, node);
  }
}

// The /api URLs a source file requests, read from its syntax tree (so comments
// never count). A string or template is a URL when its value starts with /api/;
// it ends at a query, fragment, colon or whitespace. A `${...}` expression stands for one
// segment ("x"). A trailing "/" is a prefix only when `+` completes it (an "x"
// is appended); otherwise it is the optional slash Pages accepts, and dropped.
// A `const NAME = "/api/..."` used only as `${NAME}` in templates is a base: its
// uses are expanded and its own value is not checked. Any other reference to
// NAME (`fetch(endpoint)`) checks its value as a literal.
export function apiLiterals(src) {
  const ast = JsxParser.parse(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  const all = [...nodes(ast)];
  const consts = new Map();
  for (const [n] of all)
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init) {
      const v = staticString(n.init);
      if (v !== null && /^\/api(\/|$)/.test(v)) consts.set(n.id.name, { value: v, init: n.init, direct: false });
    }
  const isBase = (expr) => expr.type === "Identifier" && consts.has(expr.name);
  for (const [n, parent] of all) {
    if (n.type !== "Identifier" || !consts.has(n.name)) continue;
    if (parent?.type === "VariableDeclarator" && parent.id === n) continue;
    if (parent?.type === "TemplateLiteral") continue; // `${NAME}`: expanded below
    if (parent?.type === "MemberExpression" && parent.property === n && !parent.computed) continue;
    if (parent?.type === "Property" && parent.key === n && !parent.computed && !parent.shorthand) continue;
    consts.get(n.name).direct = true;
  }
  const baseInits = new Set([...consts.values()].filter((c) => !c.direct).map((c) => c.init));
  const out = [];
  for (const [n, parent] of all) {
    let value;
    if (n.type === "Literal" && typeof n.value === "string" && !baseInits.has(n)) value = n.value;
    else if (n.type === "TemplateLiteral" && !baseInits.has(n))
      value = n.quasis
        .map(
          (q, i) =>
            q.value.cooked +
            (i < n.expressions.length
              ? isBase(n.expressions[i])
                ? consts.get(n.expressions[i].name).value
                : "x"
              : ""),
        )
        .join("");
    else continue;
    if (!value.startsWith("/api/")) continue;
    let lit = value.split(/[?#:\s]/)[0];
    const completed = parent?.type === "BinaryExpression" && parent.operator === "+" && parent.left === n;
    if (lit.endsWith("/")) lit = completed ? lit + "x" : lit.replace(/\/+$/, "");
    out.push(lit);
  }
  return out;
}

function staticString(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

// Deliberately unowned: the smoke probe asserts this path answers a JSON 404.
const INTENTIONALLY_UNKNOWN = new Set(["/api/zzz-nope"]);
// Specs that call an unknown route on purpose, as "relative/path /api/literal": reason.
const SPEC_EXEMPTIONS = new Map([]);

function sourceFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "__tests__", "test", "dist"].includes(e.name) || e.name === "mutation-gate.mjs") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
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
    // a constant used directly keeps its value as a literal to check
    expect(apiLiterals("const endpoint = '/api/missing-handler'; fetch(endpoint)")).toEqual(["/api/missing-handler"]);
    expect(apiLiterals("const B = '/api/admin'; f(B); g(`${B}/zzz`)")).toEqual(["/api/admin", "/api/admin/zzz"]);
    // a complete interpolation keeps the path after it, whatever its expression contains
    expect(apiLiterals('fetch(`/api/bands/${name ?? "unknown"}/missing-handler`)')).toEqual([
      "/api/bands/x/missing-handler",
    ]);
    // a trailing slash is optional unless "+" completes the prefix
    expect(apiLiterals('fetch("/api/events/timeline/")')).toEqual(["/api/events/timeline"]);
    // a comment naming a base constant is not a use of it
    expect(apiLiterals("const base = '/api/bands'; fetch(`${base}/${name}`); // base path")).toEqual(["/api/bands/x"]);
    // JSX parses, and a URL in an attribute counts
    expect(apiLiterals('const a = <a href="/api/feeds/ical?band=1">x</a>;')).toEqual(["/api/feeds/ical"]);
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
        if (!INTENTIONALLY_UNKNOWN.has(lit) && !SPEC_EXEMPTIONS.has(key) && !resolves(lit, routes))
          unresolved.push(key);
      }
    }
    expect(unresolved, `no handler under functions/api/ for:\n${unresolved.join("\n")}`).toEqual([]);
  });
});
