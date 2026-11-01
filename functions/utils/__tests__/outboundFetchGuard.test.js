import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
import { describe, expect, it } from "vitest";

// --- Durable guard: the server only ever requests addresses fixed in code ---
//
// CLAUDE.md "Outbound requests go only to fixed addresses (SSRF)". Server-side
// request forgery needs one thing: a server request whose address a caller can
// influence. Today every request in functions/ goes to a hard-coded https URL
// (the three email providers: Postmark, MailChannels, Resend) or to the site's
// own static assets through env.ASSETS. This scan keeps it that way: a new `fetch(userUrl)`, a
// template-literal URL, or another binding's .fetch fails the build until a
// human has decided it is safe and widened the rule here on purpose.
//
// It parses each file with acorn and walks the syntax tree, so formatting,
// comments and shadowed names cannot hide a call.

const SCANNED_EXTENSIONS = [".js", ".ts"];

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files = files.concat(walk(full));
    } else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const currentFile = fileURLToPath(import.meta.url);
const functionsRoot = path.join(path.dirname(currentFile), "../../");

// The only bindings whose .fetch() may be called. env.ASSETS serves this
// site's own built files and cannot reach the network.
const ALLOWED_RECEIVERS = new Set(["env.ASSETS", "context.env.ASSETS"]);

const FIXED_HTTPS = /^(?:https|wss):\/\/[^\s]+$/;

// Parsed, not regex-matched: whitespace, line breaks and comments cannot hide
// a call, and identifiers are resolved by binding rather than by name search.
function parse(source) {
  return acorn.parse(source, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
}

function children(node) {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    if (Array.isArray(value)) out.push(...value.filter((v) => v && typeof v.type === "string"));
    else if (value && typeof value.type === "string") out.push(value);
  }
  return out;
}

function memberPath(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) {
    const left = memberPath(node.object);
    return left && `${left}.${node.property.name}`;
  }
  return undefined;
}

function bindingNames(pattern, out) {
  if (!pattern) return out;
  if (pattern.type === "Identifier") out.add(pattern.name);
  else if (pattern.type === "ObjectPattern")
    pattern.properties.forEach((p) => bindingNames(p.value ?? p.argument, out));
  else if (pattern.type === "ArrayPattern") pattern.elements.forEach((e) => bindingNames(e, out));
  else if (pattern.type === "RestElement") bindingNames(pattern.argument, out);
  else if (pattern.type === "AssignmentPattern") bindingNames(pattern.left, out);
  return out;
}

// Module-level `const NAME = "https://..."`, and every name bound anywhere else
// (params, nested declarations, catch clauses, function names, imports). A
// fixed constant only counts if nothing else in the file binds the same name,
// so a shadowing parameter cannot borrow its safety.
function fixedConstants(ast) {
  const fixed = new Set();
  const topLevel = new Set();
  for (const stmt of ast.body) {
    const decl = stmt.type === "ExportNamedDeclaration" ? stmt.declaration : stmt;
    if (decl?.type !== "VariableDeclaration" || decl.kind !== "const") continue;
    for (const d of decl.declarations) {
      topLevel.add(d);
      if (d.id.type === "Identifier" && d.init?.type === "Literal" && FIXED_HTTPS.test(String(d.init.value))) {
        fixed.add(d.id.name);
      }
    }
  }
  const otherBindings = new Set();
  (function visit(node) {
    if (node.type === "VariableDeclarator" && !topLevel.has(node)) bindingNames(node.id, otherBindings);
    if (/Function/.test(node.type)) {
      if (node.id) otherBindings.add(node.id.name);
      node.params.forEach((p) => bindingNames(p, otherBindings));
    }
    if (node.type === "CatchClause") bindingNames(node.param, otherBindings);
    if (node.type === "ClassDeclaration" && node.id) otherBindings.add(node.id.name);
    if (/^Import(Default|Namespace)?Specifier$/.test(node.type)) otherBindings.add(node.local.name);
    children(node).forEach(visit);
  })(ast);
  for (const name of otherBindings) fixed.delete(name);
  return fixed;
}

function isFixedArg(arg, fixed) {
  if (!arg) return false;
  if (arg.type === "Literal") return FIXED_HTTPS.test(String(arg.value));
  if (arg.type === "TemplateLiteral")
    return arg.expressions.length === 0 && FIXED_HTTPS.test(arg.quasis[0].value.cooked);
  return arg.type === "Identifier" && fixed.has(arg.name);
}

// Names that open a network connection on Workers. Every reference to one is a
// violation unless it is one of the approved shapes below.
const NETWORK_GLOBALS = new Set(["fetch", "WebSocket", "EventSource"]);
const GLOBAL_OBJECTS = new Set(["globalThis", "self", "global"]);

function isNamed(node, names) {
  if (node.type === "Identifier") return names.has(node.name);
  if (node.type === "Literal") return names.has(node.value);
  if (node.type === "TemplateLiteral") return node.expressions.length === 0 && names.has(node.quasis[0].value.cooked);
  return false;
}

// Allowlist, not blocklist: the approved shapes are `fetch(<fixed https>)`,
// `new WebSocket(<fixed wss/https>)` and `env.ASSETS.fetch(...)`. Any other
// reference to a network global or a `.fetch` property is a violation, which
// covers aliasing (`const f = fetch`, `const f = globalThis.fetch`) without
// enumerating each form. Dynamic global lookups (`globalThis[key]`) and
// non-literal dynamic imports are refused because no scan can see through them.
//
// Scope: this catches a network call introduced by mistake. It is not a
// defence against code written to evade it; review is.
function findViolations(source) {
  const ast = parse(source);
  const fixed = fixedConstants(ast);
  const violations = [];
  let globalCount = 0;
  let assetsCount = 0;
  const approved = new Set();

  (function visit(node) {
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const callee = node.callee;
      if (callee.type === "Identifier" && NETWORK_GLOBALS.has(callee.name)) {
        approved.add(callee);
        if (callee.name === "fetch") globalCount += 1;
        if (!isFixedArg(node.arguments[0], fixed)) {
          const arg = node.arguments[0];
          violations.push(`${callee.name}(${arg ? source.slice(arg.start, arg.end) : ""})`);
        }
      } else if (
        node.type === "CallExpression" &&
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.name === "fetch" &&
        ALLOWED_RECEIVERS.has(memberPath(callee.object))
      ) {
        approved.add(callee);
        assetsCount += 1;
      }
    }

    if (node.type === "Identifier" && NETWORK_GLOBALS.has(node.name) && !approved.has(node)) {
      violations.push(`${node.name} referenced outside an approved call`);
    }
    if (node.type === "MemberExpression" && !approved.has(node)) {
      if (!node.computed && NETWORK_GLOBALS.has(node.property.name)) {
        violations.push(`${memberPath(node.object) ?? "<expression>"}.${node.property.name}`);
      } else if (node.computed && isNamed(node.property, NETWORK_GLOBALS)) {
        violations.push(`computed [${source.slice(node.property.start, node.property.end)}] access`);
      } else if (node.computed && node.object.type === "Identifier" && GLOBAL_OBJECTS.has(node.object.name)) {
        violations.push(`dynamic ${node.object.name}[...] lookup`);
      }
    }
    if (node.type === "ImportDeclaration" && node.source.value === "cloudflare:sockets") {
      violations.push("cloudflare:sockets import");
    }
    if (node.type === "ImportExpression") {
      if (node.source.type !== "Literal") violations.push("dynamic import() of a computed module");
      else if (node.source.value === "cloudflare:sockets") violations.push("cloudflare:sockets import");
    }

    // Do not descend into names that are labels, not references: non-computed
    // property keys and member property names.
    if (node.type === "MemberExpression" && !node.computed) {
      visit(node.object);
      return;
    }
    // A computed key destructured from the global object is a dynamic global
    // lookup (`const { [k]: f } = globalThis`). Ordinary data is not.
    const pattern =
      node.type === "VariableDeclarator" ? node.id : node.type === "AssignmentExpression" ? node.left : undefined;
    const destructuredFrom =
      node.type === "VariableDeclarator" ? node.init : node.type === "AssignmentExpression" ? node.right : undefined;
    if (
      pattern?.type === "ObjectPattern" &&
      destructuredFrom?.type === "Identifier" &&
      GLOBAL_OBJECTS.has(destructuredFrom.name) &&
      pattern.properties.some((p) => p.type === "Property" && p.computed && p.key.type !== "Literal")
    ) {
      violations.push(`dynamic ${destructuredFrom.name} destructuring`);
    }
    // Destructuring renames are aliasing too: `const { fetch: f } = globalThis`.
    if (node.type === "ObjectPattern") {
      for (const p of node.properties) {
        if (p.type !== "Property") continue;
        if (isNamed(p.key, NETWORK_GLOBALS)) violations.push(`destructured ${source.slice(p.key.start, p.key.end)}`);
      }
    }
    if ((node.type === "Property" || node.type === "MethodDefinition") && !node.computed) {
      visit(node.value);
      return;
    }
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      // Callee after arguments is irrelevant now; approval is recorded above.
      visit(node.callee);
      node.arguments.forEach(visit);
      return;
    }
    children(node).forEach(visit);
  })(ast);
  return { violations, globalCount, assetsCount };
}

describe("server requests go only to addresses fixed in code (SSRF guard)", () => {
  const files = walk(functionsRoot);
  const results = files.map((file) => ({
    rel: path.relative(functionsRoot, file).split(path.sep).join("/"),
    ...findViolations(readFileSync(file, "utf8")),
  }));

  it("no file in functions/ requests a caller-influenced address", () => {
    const offenders = results.filter((r) => r.violations.length > 0).map((r) => `${r.rel}: ${r.violations.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("still finds the requests it is meant to police", () => {
    // Postmark + MailChannels + Resend. If this drops, the scan
    // has stopped seeing fetch calls and the test above is passing vacuously.
    const totalGlobal = results.reduce((n, r) => n + r.globalCount, 0);
    const totalAssets = results.reduce((n, r) => n + r.assetsCount, 0);
    expect(totalGlobal).toBeGreaterThanOrEqual(3);
    expect(totalAssets).toBeGreaterThanOrEqual(1);
  });

  it("the detector rejects the shapes that make SSRF possible", () => {
    const flagged = (src) => findViolations(src).violations.length > 0;
    expect(flagged("await fetch(body.url);")).toBe(true);
    expect(flagged("await fetch(`${base}/x`);")).toBe(true);
    expect(flagged('await fetch("http://169.254.169.254/");')).toBe(true);
    expect(flagged("const U = env.URL;\nawait fetch(U);")).toBe(true);
    expect(flagged("await env.OTHER.fetch(req);")).toBe(true);
    expect(flagged('import { connect } from "cloudflare:sockets";')).toBe(true);
    expect(flagged("await fetch (body.url);")).toBe(true);
    expect(flagged("await fetch(\n  body.url,\n);")).toBe(true);
    expect(flagged('const U = "https://x.example/a";\nexport function f(U) { return fetch(U); }')).toBe(true);
    expect(flagged('const U = "https://x.example/a";\nfunction f() { const U = input; return fetch(U); }')).toBe(true);
    expect(flagged("const f = fetch;\nf(body.url);")).toBe(true);
    expect(flagged("await globalThis.fetch(body.url);")).toBe(true);
    expect(flagged('await globalThis["fetch"](body.url);')).toBe(true);
    expect(flagged("await env.OTHER[`fetch`](req);")).toBe(true);
    expect(flagged("const outbound = globalThis.fetch;\nawait outbound(body.url);")).toBe(true);
    expect(flagged("const { fetch: outbound } = globalThis;\nawait outbound(body.url);")).toBe(true);
    expect(flagged("const { WebSocket: WS } = globalThis;\nnew WS(body.url);")).toBe(true);
    expect(flagged("const { [body.key]: f } = globalThis;\nawait f(body.url);")).toBe(true);
    expect(flagged("await globalThis[body.method](body.url);")).toBe(true);
    expect(flagged("const ws = new WebSocket(body.url);")).toBe(true);
    expect(flagged('await import("cloudflare:sockets");')).toBe(true);
    expect(flagged("await import(body.module);")).toBe(true);
    // ...and accepts the shapes in use today.
    expect(flagged('await fetch("https://api.resend.com/emails", {});')).toBe(false);
    expect(flagged("const { [field]: value } = record;")).toBe(false);
    expect(flagged('const URL_A = "https://x.example/a";\nawait fetch(URL_A, {});')).toBe(false);
    expect(flagged("export function h(request, env) { return env.ASSETS.fetch(request); }")).toBe(false);
    expect(flagged("// fetch(anything) in a comment")).toBe(false);
  });
});
