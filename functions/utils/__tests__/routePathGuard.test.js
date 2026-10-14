import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWLIST = new Set(["utils/routePath.js", "_middleware.js"]);

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

function rawApiPathChecks(source) {
  return (
    source.match(
      /\b\w+\.pathname\s*(?:\.startsWith|\.includes)\(\s*["']\/api|\b\w+\.pathname\s*(?:===|!==)\s*["']\/api|\b\w+\.pathname[^\n;]*\.test\(\s*\/\^\\\/api/,
    ) ?? []
  );
}

describe("case-insensitive Pages route path guard", () => {
  it("finds the routePath call sites and no unallowlisted raw API path checks", () => {
    const files = sourceFiles(FUNCTIONS_DIR);
    const routePathCallSites = files.filter((file) => readFileSync(file, "utf8").includes("routePath("));
    expect(routePathCallSites.map(relativeSourceFile)).toEqual(
      expect.arrayContaining(["api/admin/_middleware.js", "utils/rateLimit.js", "utils/csrf.js"]),
    );

    const offenders = files.flatMap((file) => {
      if (ALLOWLIST.has(relativeSourceFile(file))) return [];
      return rawApiPathChecks(readFileSync(file, "utf8")).map(() => relativeSourceFile(file));
    });
    expect(offenders).toEqual([]);
  });

  it("flags a planted raw pathname check", () => {
    expect(rawApiPathChecks('const url = new URL(request.url); if (url.pathname.startsWith("/api/")) {}')).toHaveLength(
      1,
    );
  });
});
