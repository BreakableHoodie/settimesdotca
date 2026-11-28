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

const SCOPED = new Set(["Program", "BlockStatement", "StaticBlock", "SwitchStatement", "CatchClause"]);
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const LOOPS = new Set(["ForStatement", "ForInStatement", "ForOfStatement"]);
const SHADOW = { shadow: true }; // a name bound to something this scan cannot evaluate

function patternNames(p, out = []) {
  if (!p) return out;
  if (p.type === "Identifier") out.push(p.name);
  else if (p.type === "ObjectPattern")
    for (const q of p.properties) patternNames(q.type === "RestElement" ? q.argument : q.value, out);
  else if (p.type === "ArrayPattern") for (const q of p.elements) patternNames(q, out);
  else if (p.type === "RestElement") patternNames(p.argument, out);
  else if (p.type === "AssignmentPattern") patternNames(p.left, out);
  return out;
}

// The bindings a scope-creating node introduces, so a reference resolves to the
// declaration it lexically means even when another scope reuses the name.
function declare(node, scope) {
  const bind = (decl) => {
    if (decl.type === "VariableDeclaration")
      for (const d of decl.declarations)
        if (d.id.type === "Identifier") scope.vars.set(d.id.name, { decl: d, scope, direct: false });
        else for (const name of patternNames(d.id)) scope.vars.set(name, SHADOW);
    else if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id)
      scope.vars.set(decl.id.name, SHADOW);
    else if (decl.type === "ImportDeclaration") for (const sp of decl.specifiers) scope.vars.set(sp.local.name, SHADOW);
    else if (decl.type === "ExportNamedDeclaration" && decl.declaration) bind(decl.declaration);
  };
  if (FUNCTIONS.has(node.type)) {
    for (const prm of node.params) for (const name of patternNames(prm)) scope.vars.set(name, SHADOW);
    if (node.type === "FunctionExpression" && node.id) scope.vars.set(node.id.name, SHADOW);
  } else if (node.type === "CatchClause") for (const name of patternNames(node.param)) scope.vars.set(name, SHADOW);
  else if (LOOPS.has(node.type)) bind((node.init ?? node.left) || {});
  else if (node.type === "SwitchStatement") for (const c of node.cases) c.consequent.forEach(bind);
  else node.body.forEach(bind);
}

function lookup(scope, name) {
  for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
  return null;
}

// A name in this position is a binding or a label, not a read of a variable.
function isReference(n, parent) {
  if (!parent) return true;
  if (parent.type === "VariableDeclarator" && parent.id === n) return false;
  if (
    (parent.type === "MemberExpression" || parent.type === "PropertyDefinition") &&
    parent.property === n &&
    !parent.computed
  )
    return false;
  if (
    (parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
    parent.key === n
  )
    return !!parent.shorthand && !parent.computed;
  if (FUNCTIONS.has(parent.type)) return parent.id !== n && !parent.params.includes(n); // `() => B` reads B
  if ((parent.type === "ClassDeclaration" || parent.type === "ClassExpression") && parent.id === n) return false;
  if (parent.type === "AssignmentExpression" && parent.left === n) return false; // a write, not a read
  if (/^(Import|Export)/.test(parent.type) || parent.type === "CatchClause") return false;
  if (/Statement$/.test(parent.type) && parent.label === n) return false;
  return true;
}

// `+` and `${...}` build one URL out of their parts.
const composes = (parent) =>
  (parent?.type === "BinaryExpression" && parent.operator === "+") || parent?.type === "TemplateLiteral";
const isStringish = (n) =>
  (n.type === "Literal" && typeof n.value === "string") ||
  n.type === "TemplateLiteral" ||
  (n.type === "BinaryExpression" && n.operator === "+");

// Stands for a part this scan cannot know; reported as "x". A distinct
// character, so a literal "x" in a URL is never mistaken for an unknown part.
const UNKNOWN = "\u0000";

// The URL an expression builds. A literal is its text, a name bound to a
// declaration that is never reassigned is that declaration's value, and anything
// else (a call, a parameter, an `a ?? b`, a reassigned `let`) is UNKNOWN.
function evaluate(n, scope, depth = 0) {
  if (depth > 20) return UNKNOWN;
  if (n.type === "Literal") return typeof n.value === "string" ? n.value : UNKNOWN;
  if (n.type === "TemplateLiteral")
    return n.quasis
      .map((q, i) => q.value.cooked + (i < n.expressions.length ? evaluate(n.expressions[i], scope, depth + 1) : ""))
      .join("");
  if (n.type === "BinaryExpression" && n.operator === "+")
    return evaluate(n.left, scope, depth + 1) + evaluate(n.right, scope, depth + 1);
  if (n.type === "Identifier") {
    const b = lookup(scope, n.name);
    if (b && !b.shadow && !b.reassigned && b.decl.init && isStringish(b.decl.init))
      return evaluate(b.decl.init, b.scope, depth + 1);
  }
  return UNKNOWN;
}

// The /api URLs a source file requests, read from its syntax tree (so comments
// never count). Each whole string expression (a literal, a template, a `+`
// chain) is evaluated as one URL; it counts when it starts with /api/, ends at a
// query, fragment, colon or whitespace, and drops a trailing "/" (Pages accepts
// both). A declaration whose every use is inside a `+` or a `${...}` is a base:
// its uses are checked, its own value is not. Any other use (`fetch(endpoint)`)
// checks its value too. Names resolve by lexical scope.
export function apiLiterals(src) {
  const ast = JsxParser.parse(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  const candidates = [];
  const visit = (n, parent, scope) => {
    if (!n || typeof n.type !== "string") return;
    const outer = scope;
    if (SCOPED.has(n.type) || FUNCTIONS.has(n.type) || LOOPS.has(n.type)) {
      scope = { vars: new Map(), parent: scope };
      declare(n, scope);
    }
    if (n.type === "Identifier" && isReference(n, parent) && !composes(parent)) {
      const b = lookup(scope, n.name);
      if (b && !b.shadow) b.direct = true;
    }
    const target = n.type === "AssignmentExpression" ? n.left : n.type === "UpdateExpression" ? n.argument : null;
    if (target?.type === "Identifier") {
      const b = lookup(scope, target.name);
      if (b && !b.shadow) b.reassigned = true; // its initializer is no longer its value
    }
    if (isStringish(n) && !composes(parent)) candidates.push({ n, parent, scope });
    for (const [key, value] of Object.entries(n)) {
      if (key === "type" || key === "start" || key === "end") continue;
      for (const child of Array.isArray(value) ? value : [value])
        // a switch's discriminant runs before its cases' bindings exist
        if (child && typeof child === "object")
          visit(child, n, n.type === "SwitchStatement" && key === "discriminant" ? outer : scope);
    }
  };
  visit(ast, null, null);
  const out = [];
  for (const { n, parent, scope } of candidates) {
    if (parent?.type === "VariableDeclarator" && parent.init === n && parent.id.type === "Identifier") {
      const b = lookup(scope, parent.id.name);
      if (b && !b.shadow && b.decl === parent && !b.direct) continue; // a base, checked where it is used
    }
    // An unknown first part (`origin + "/api/x"`, `${BASE}/api/x`) is an origin.
    let value = evaluate(n, scope);
    if (value.startsWith(`${UNKNOWN}/api/`)) value = value.slice(UNKNOWN.length);
    value = value.replaceAll(UNKNOWN, "x");
    if (!value.startsWith("/api/")) continue;
    out.push(value.split(/[?#:\s]/)[0].replace(/\/+$/, ""));
  }
  return out;
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
    // a static suffix after "+" is part of the URL
    expect(apiLiterals('fetch("/api/events/timeline" + "/missing-handler")')).toEqual([
      "/api/events/timeline/missing-handler",
    ]);
    // an unknown origin before the path is dropped, not the path; a literal "x/" is a path
    expect(apiLiterals('fetch(origin + "/api/zzz")')).toEqual(["/api/zzz"]);
    expect(apiLiterals('fetch("x/api/missing-handler")')).toEqual([]);
    // a constant read in an arrow body is a direct use
    expect(apiLiterals("const e = '/api/missing-handler'; const g = () => e; fetch(g())")).toEqual([
      "/api/missing-handler",
    ]);
    // a reassigned binding is unknown, not its stale initializer
    expect(apiLiterals('let B = "/api/bands"; B = "/api/events/timeline"; fetch(`${B}/missing-handler`)')).toEqual([
      "/api/events/timeline",
    ]);
    // a switch's discriminant resolves outside the case scope
    expect(
      apiLiterals(
        'const B = "/api/events/timeline"; switch (fetch(`${B}/missing-handler`)) { default: { } const B = "/api/bands"; }',
      ),
    ).toEqual(["/api/events/timeline/missing-handler"]);
    // a name resolves to the declaration in its own scope, not a same-named one elsewhere
    const scoped = apiLiterals(
      'function a() { const B = "/api/events/timeline"; fetch(`${B}/missing-handler`); }\n' +
        'function b() { const B = "/api/bands"; fetch(`${B}/x`); }',
    );
    expect(scoped).toEqual(["/api/events/timeline/missing-handler", "/api/bands/x"]);
    const synthetic = ["/api/events/timeline", "/api/bands/[name]"];
    expect(scoped.map((l) => resolves(l, synthetic))).toEqual([false, true]);
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
