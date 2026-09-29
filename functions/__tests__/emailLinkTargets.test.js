import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Every link a SetTimes email carries must lead somewhere that serves it.
//
// A link and its handler can each be tested and still not point at one another.
// This scans every file that sends mail, extracts each site path it builds,
// and requires that path to resolve to a Pages Function file or a frontend
// <Route>.

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const FUNCTIONS = join(REPO, "functions");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
}

const EMAIL_SENDERS = walk(FUNCTIONS).filter((file) =>
  /\bsendEmail\s*\(|from\s+["'][./]*(?:utils\/)?email\.js["']/.test(readFileSync(file, "utf8")),
);

// `${base}/some/${id}/path`  and  new URL("/some/path", base)
function extractPaths(source) {
  const paths = new Set();
  for (const m of source.matchAll(/\$\{\s*[A-Za-z_]*(?:[Uu]rl|[Bb]ase|[Hh]ost)[A-Za-z_]*\s*\}(\/[^`"'?#\s]*)/g)) {
    paths.add(m[1]);
  }
  for (const m of source.matchAll(/new URL\(\s*["'](\/[^"'?#]*)["']/g)) paths.add(m[1]);
  return [...paths];
}

// Does functions/ serve this path? `${…}` segments match any `[param]` dir/file.
function servedByFunction(path) {
  const segments = path.split("/").filter(Boolean);
  const match = (dir, i) => {
    if (i === segments.length) return existsSync(join(dir, "index.js"));
    const seg = segments[i];
    const last = i === segments.length - 1;
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    const dynamic = seg.includes("${");
    const candidates = entries.filter((e) => {
      const base = e.replace(/\.js$/, "");
      return dynamic ? /^\[.+\]$/.test(base) : base === seg || /^\[.+\]$/.test(base);
    });
    return candidates.some((e) => {
      const p = join(dir, e);
      if (e.endsWith(".js")) return last;
      return statSync(p).isDirectory() && match(p, i + 1);
    });
  };
  return match(FUNCTIONS, 0);
}

const FRONTEND_ROUTES = [...readFileSync(join(REPO, "frontend/src/main.jsx"), "utf8").matchAll(/path="([^"]+)"/g)].map(
  (m) => m[1],
);

function servedByFrontend(path) {
  return FRONTEND_ROUTES.some((route) =>
    route.endsWith("/*") ? path === route.slice(0, -2) || path.startsWith(route.slice(0, -1)) : route === path,
  );
}

describe("every link in an outgoing email reaches a real handler", () => {
  const links = EMAIL_SENDERS.flatMap((file) =>
    extractPaths(readFileSync(file, "utf8")).map((path) => ({ file: relative(REPO, file), path })),
  );

  it("finds the email senders and their links (the scan is not vacuous)", () => {
    expect(EMAIL_SENDERS.length).toBeGreaterThanOrEqual(8);
    expect(links.length).toBeGreaterThanOrEqual(10);
    expect(links.map((l) => l.path)).toContain("/api/subscriptions/verify");
  });

  it.each(links.map((l) => [l.path, l.file]))("%s (from %s) is served", (path) => {
    expect(servedByFunction(path) || servedByFrontend(path), `${path} has no Pages Function or <Route>`).toBe(true);
  });

  it("the matcher can say no", () => {
    expect(servedByFunction("/verify")).toBe(false);
    expect(servedByFrontend("/verify")).toBe(false);
  });
});
