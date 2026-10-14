import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guard: a Pages preview deployment must never bind production data.
//
// Without an [env.preview] block, Cloudflare Pages applies wrangler.toml's
// top-level bindings to previews too, and each deploy overwrites the dashboard.
// Until 2026-10-13 that put 40 stale previews, running pre-pen-test code with
// no secrets set, on the production D1 and photo bucket. See the comment above
// [env.preview] in wrangler.toml.
//
// No TOML dependency: the checks only need each line's enclosing table header,
// which a line scan gives exactly.

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const toml = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");

const PRODUCTION_D1_ID = "c6c8b4a6-f951-47c1-a787-aab0a61ca09b";
const PRODUCTION_NAMES = ["settimes-production-db", "settimes-band-photos", "settimes_metrics"];

// Each non-comment line paired with the table header it sits under ("" = top level).
function linesWithTable(source) {
  let table = "";
  const out = [];
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) table = header[1].trim();
    out.push({ table, line });
  }
  return out;
}

describe("preview deployments never bind production data", () => {
  const lines = linesWithTable(toml);

  it("declares an [env.preview] block, so top-level bindings do not apply to previews", () => {
    expect(lines.some(({ line }) => line === "[env.preview]")).toBe(true);
  });

  it("names production resources only in top-level binding tables", () => {
    const leaks = lines.filter(
      ({ table, line }) =>
        table.startsWith("env.") && (line.includes(PRODUCTION_D1_ID) || PRODUCTION_NAMES.some((n) => line.includes(n))),
    );
    expect(leaks).toEqual([]);
  });

  it("still finds the production binding it protects (not passing vacuously)", () => {
    expect(lines.some(({ table, line }) => table === "d1_databases" && line.includes(PRODUCTION_D1_ID))).toBe(true);
  });

  it("the scan attributes lines to the right table", () => {
    const sample =
      '[[d1_databases]]\ndatabase_id = "x"\n[env.preview]\n[[env.preview.d1_databases]]\ndatabase_id = "y"';
    const tables = linesWithTable(sample).map((l) => l.table);
    expect(tables).toEqual([
      "d1_databases",
      "d1_databases",
      "env.preview",
      "env.preview.d1_databases",
      "env.preview.d1_databases",
    ]);
  });
});
