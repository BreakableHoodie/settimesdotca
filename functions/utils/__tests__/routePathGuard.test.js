import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
import { describe, expect, it } from "vitest";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");

// These are narrow exceptions, not file-wide exemptions. The root gate is safe because
// Pages never dispatches /API/ to Functions; getUrlId uses the raw path only to extract a
// segment, and invalid casing fails validation with 400 rather than selecting a resource.
const ALLOWLIST = [
  {
    file: "_middleware.js",
    snippet: 'url.pathname.startsWith("/api/")',
    reason: "Pages never dispatches /API/ to Functions",
  },
  {
    file: "utils/request.js",
    snippet: 'url.pathname.split("/")',
    reason: "getUrlId extracts a segment; invalid casing fails closed with 400",
  },
];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

function relativeSourceFile(file) {
  return file.slice(FUNCTIONS_DIR.length + 1);
}

function parse(source) {
  return acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
}

function children(node) {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === "type" || key === "start" || key === "end") return [];
    if (Array.isArray(value)) return value.filter((child) => child?.type);
    return value?.type ? [value] : [];
  });
}

function containsRawPath(node) {
  if (!node) return false;
  if (node.type === "Identifier" && /pathname$/i.test(node.name)) return true;
  if (
    node.type === "MemberExpression" &&
    ((node.computed && node.property.type === "Literal" && node.property.value === "pathname") ||
      (!node.computed && node.property.name === "pathname"))
  ) {
    return true;
  }
  return children(node).some(containsRawPath);
}

function isDecisionCall(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.computed) {
    return false;
  }
  const method = node.callee.property.name;
  if (["startsWith", "endsWith", "includes", "match", "test", "has"].includes(method)) {
    return containsRawPath(node.callee.object) || node.arguments.some(containsRawPath);
  }
  return false;
}

function findRawPathDecisions(source) {
  const ast = parse(source);
  const findings = [];

  (function visit(node) {
    if (
      isDecisionCall(node) ||
      (node.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(node.operator) && containsRawPath(node))
    ) {
      findings.push({ start: node.start, end: node.end, source: source.slice(node.start, node.end) });
    }
    children(node).forEach(visit);
  })(ast);

  return findings;
}

function isAllowlisted(file, finding, source) {
  const relative = relativeSourceFile(file);
  return ALLOWLIST.some(({ file: allowedFile, snippet }) => {
    if (relative !== allowedFile) return false;
    const start = source.indexOf(snippet);
    return start !== -1 && finding.start >= start && finding.end <= start + snippet.length;
  });
}

function unallowlistedFindings(file, source) {
  return findRawPathDecisions(source).filter((finding) => !isAllowlisted(file, finding, source));
}

describe("case-insensitive Pages route path guard", () => {
  it("finds the routePath call sites and no unallowlisted raw pathname decisions", () => {
    const files = sourceFiles(FUNCTIONS_DIR);
    const routePathCallSites = files.filter((file) => readFileSync(file, "utf8").includes("routePath("));
    expect(routePathCallSites.map(relativeSourceFile)).toEqual(
      expect.arrayContaining(["api/admin/_middleware.js", "utils/rateLimit.js", "utils/csrf.js"]),
    );

    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return unallowlistedFindings(file, source).map((finding) => ({
        file: relativeSourceFile(file),
        source: finding.source,
      }));
    });
    expect(offenders).toEqual([]);
  });

  it.each([
    ['const { pathname } = new URL(u); if (pathname.startsWith("/api/x")) {}', "destructured pathname"],
    ["PREFIXES.some((p) => url.pathname.startsWith(p))", "some callback"],
    ["RE.test(url.pathname)", "test argument"],
    ["SET.has(url.pathname)", "has argument"],
    ['new URL(request.url).pathname === "/api/x"', "URL property comparison"],
    ['"/api/x" === url.pathname', "reverse comparison"],
    ['rawPathname.endsWith("/x")', "pathname variable"],
    ["`/api/x` === url.pathname", "template literal comparison"],
  ])("flags %s (%s)", (source) => {
    expect(findRawPathDecisions(source)).not.toHaveLength(0);
  });

  it.each([
    ['log.info("x", { path: url.pathname })', "logging"],
    ['url.pathname.split("/")', "data extraction"],
    ['routePath(request).startsWith("/api/x")', "normalized path"],
  ])("does not flag %s (%s)", (source) => {
    expect(findRawPathDecisions(source)).toHaveLength(0);
  });
});
