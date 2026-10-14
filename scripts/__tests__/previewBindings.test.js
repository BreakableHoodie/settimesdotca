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
const SCRATCH_D1_ID = "c06cc3e7-92e3-4044-a705-608330c1f4ba";
const SCRATCH_D1_NAME = "settimes-e2e-db";

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

  const previewD1 = lines.filter(({ table }) => table === "env.preview.d1_databases");

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

  it("binds exactly the scratch D1 and no other preview resource", () => {
    expect(previewD1).toEqual([
      { table: "env.preview.d1_databases", line: "[[env.preview.d1_databases]]" },
      { table: "env.preview.d1_databases", line: 'binding = "DB"' },
      { table: "env.preview.d1_databases", line: `database_name = "${SCRATCH_D1_NAME}"` },
      { table: "env.preview.d1_databases", line: `database_id = "${SCRATCH_D1_ID}"` },
    ]);
    // The only other preview table is [env.preview.vars]; no R2, no Analytics Engine.
    expect(
      [...new Set(lines.filter(({ table }) => table.startsWith("env.preview.")).map(({ table }) => table))].sort(),
    ).toEqual(["env.preview.d1_databases", "env.preview.vars"]);
  });

  // isDevRequest allowlists development/dev/test; any of those on a public
  // preview would switch off secure cookies, CSRF and Turnstile there.
  it("previews declare a non-dev ENVIRONMENT and allow only the edge-e2e origin", () => {
    const vars = lines.filter(({ table, line }) => table === "env.preview.vars" && line !== "[env.preview.vars]");
    expect(vars.map(({ line }) => line)).toEqual([
      'ENVIRONMENT = "preview"',
      'PUBLIC_DATA_PUBLISH_ENABLED = "true"',
      'CORS_ALLOWED_ORIGINS = "https://edge-e2e.longweekend-bandcrawl.pages.dev"',
    ]);
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
