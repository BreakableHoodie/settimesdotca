#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const rootDir = process.cwd();
const specPath = path.join(rootDir, "docs/api-spec.yaml");
const routesDir = path.join(rootDir, "functions/api");

/**
 * Routes that are intentionally NOT part of the published OpenAPI contract.
 * Listing them here makes each exclusion deliberate and reviewable: the drift
 * check below treats an allowlisted route as "documented", so it never trips
 * the "missing from spec" error — but a NEW undocumented route still does.
 *
 * Keep this list tiny. Public and admin surface belongs in the spec.
 */
const INTERNAL_ROUTES = new Set([
  // Secret-gated (CRON_SECRET) trigger for the scheduled handler. Called by the
  // .github/workflows/scheduled-jobs.yml cron, not by clients — Cloudflare Pages
  // has no native cron, so this is infrastructure glue, not contract surface.
  "/api/internal/run-scheduled",
]);

// A file under functions/api/ is only a real HTTP route if it EXPORTS an
// onRequest handler — either directly (export [async] function/const onRequestX)
// or via re-export (export { onRequestPost } from "./other.js"). Files that
// export only helpers (e.g. maintenance/retention.js) are importable modules,
// not endpoints, and must not appear in the contract.
const HANDLER_EXPORT = /export\s+(?:async\s+)?(?:function|const)\s+onRequest|export\s*\{[^}]*\bonRequest/;

/**
 * Cloudflare Pages Functions use file-based routing, so the set of real HTTP
 * endpoints is derivable from the filesystem. Walk functions/api/ and map each
 * route file that exports a handler to its OpenAPI path, skipping Pages
 * conventions and test helpers:
 *   - files/dirs starting with "_"  (_middleware.js, _scheduled.js)
 *   - __tests__ directories, *.test.js, and shared test-utils.js
 *   - files that export no onRequest* handler (colocated helper modules)
 */
async function collectRoutePaths(dir) {
  const paths = [];

  async function walk(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith("_") || entry.name === "__tests__") continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      if (entry.name.endsWith(".test.js") || entry.name === "test-utils.js") continue;

      const source = await readFile(abs, "utf8");
      if (!HANDLER_EXPORT.test(source)) continue;

      // functions/api/admin/events/[id]/edit.js -> /api/admin/events/{id}/edit
      const rel = path.relative(path.join(rootDir, "functions"), abs);
      const route =
        "/" +
        rel
          .replace(/\.js$/, "")
          .split(path.sep)
          .map((seg) => seg.replace(/^\[(.+)\]$/, "{$1}"))
          .join("/");
      paths.push(route);
    }
  }

  await walk(dir);
  return paths.sort();
}

function reportDrift(label, items) {
  console.error(`\n${label}:`);
  for (const item of items) console.error(`  - ${item}`);
}

async function main() {
  try {
    await access(specPath);

    const api = await SwaggerParser.validate(specPath);
    const title = api?.info?.title || "OpenAPI document";
    const version = api?.info?.version ? ` ${api.info.version}` : "";
    console.log(`OpenAPI spec validated: ${title}${version}`);

    // Route-vs-spec drift detection (the root cause of issue #416).
    const routePaths = await collectRoutePaths(routesDir);
    const routeSet = new Set(routePaths);
    const specSet = new Set(Object.keys(api.paths || {}));

    const missing = routePaths.filter((p) => !specSet.has(p) && !INTERNAL_ROUTES.has(p));
    const phantom = [...specSet].filter((p) => !routeSet.has(p)).sort();
    const staleAllowlist = [...INTERNAL_ROUTES].filter((p) => !routeSet.has(p)).sort();

    const problems = [];
    if (missing.length) {
      reportDrift("Routes implemented but missing from docs/api-spec.yaml", missing);
      problems.push("missing paths");
    }
    if (phantom.length) {
      reportDrift("Paths in docs/api-spec.yaml with no backing route file", phantom);
      problems.push("phantom paths");
    }
    if (staleAllowlist.length) {
      reportDrift("INTERNAL_ROUTES entries with no backing route file (remove them)", staleAllowlist);
      problems.push("stale allowlist");
    }

    if (problems.length) {
      console.error(
        `\nOpenAPI drift check failed (${problems.join(", ")}). ` +
          `Update docs/api-spec.yaml (and docs/API_DOCUMENTATION.md) to match functions/api/.`,
      );
      process.exit(1);
    }

    const documented = routePaths.length - INTERNAL_ROUTES.size;
    console.log(
      `OpenAPI route coverage: ${documented} documented + ${INTERNAL_ROUTES.size} internal (allowlisted) ` +
        `= ${routePaths.length} route files, no drift.`,
    );
  } catch (error) {
    console.error("OpenAPI validation failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
