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
// (Turnstile, the three email providers) or to the site's own static assets
// through env.ASSETS. This scan keeps it that way: a new `fetch(userUrl)`, a
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

const FIXED_HTTPS = /^https:\/\/[^\s]+$/;

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
  return null;
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

function findViolations(source) {
  const ast = parse(source);
  const fixed = fixedConstants(ast);
  const violations = [];
  let globalCount = 0;
  let assetsCount = 0;
  const callees = new Set();
  (function visit(node) {
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (callee.type === "Identifier" && callee.name === "fetch") {
        callees.add(callee);
        globalCount += 1;
        if (!isFixedArg(node.arguments[0], fixed))
          violations.push(
            `fetch(${source.slice(node.arguments[0]?.start ?? node.start, node.arguments[0]?.end ?? node.end)})`,
          );
      } else if (callee.type === "MemberExpression" && !callee.computed && callee.property.name === "fetch") {
        const receiver = memberPath(callee.object);
        if (ALLOWED_RECEIVERS.has(receiver)) assetsCount += 1;
        else violations.push(`${receiver ?? "<expression>"}.fetch(`);
      }
    }
    // A bare reference that is not the callee (`const f = fetch`, passing it
    // along) would let a call escape the argument check.
    if (node.type === "Identifier" && node.name === "fetch" && !callees.has(node)) {
      violations.push("fetch referenced outside a direct call");
    }
    // obj["fetch"] / obj[`fetch`]: a computed key naming fetch dodges both
    // checks above, so it is refused outright.
    if (
      node.type === "MemberExpression" &&
      node.computed &&
      ((node.property.type === "Literal" && node.property.value === "fetch") ||
        (node.property.type === "TemplateLiteral" &&
          node.property.expressions.length === 0 &&
          node.property.quasis[0].value.cooked === "fetch"))
    ) {
      violations.push('computed ["fetch"] access');
    }
    if (node.type === "ImportDeclaration" && node.source.value === "cloudflare:sockets") {
      violations.push("cloudflare:sockets import");
    }
    if (node.type === "CallExpression") {
      // Visit the callee last so the direct-call identifier is registered first.
      node.arguments.forEach(visit);
      visit(node.callee);
      return;
    }
    if (node.type === "MemberExpression" && !node.computed) {
      visit(node.object);
      return;
    }
    if (node.type === "Property" && !node.computed && node.key.type === "Identifier") {
      visit(node.value);
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
    // Turnstile + Postmark + MailChannels + Resend. If this drops, the scan
    // has stopped seeing fetch calls and the test above is passing vacuously.
    const totalGlobal = results.reduce((n, r) => n + r.globalCount, 0);
    const totalAssets = results.reduce((n, r) => n + r.assetsCount, 0);
    expect(totalGlobal).toBeGreaterThanOrEqual(4);
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
    // ...and accepts the shapes in use today.
    expect(flagged('await fetch("https://api.resend.com/emails", {});')).toBe(false);
    expect(flagged('const URL_A = "https://x.example/a";\nawait fetch(URL_A, {});')).toBe(false);
    expect(flagged("export function h(request, env) { return env.ASSETS.fetch(request); }")).toBe(false);
    expect(flagged("// fetch(anything) in a comment")).toBe(false);
  });
});
