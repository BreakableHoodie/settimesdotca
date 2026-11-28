#!/usr/bin/env node
// Fails the build when the entry chunk's gzip size passes its budget (#1499).
// Vite's chunkSizeWarningLimit only warns; this is the enforcing half.
// The entry chunk is the module script that dist/index.html loads first, so
// every page (home, band, event, venue, recap) pays for it.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Measured 2026-11-27: 121,703 bytes with gzipSync level 9 (Vite reports
// 123.2 kB in its own units). Budget is about 10% above that. A size is
// deterministic, unlike a Lighthouse score, so a local measurement is valid.
export const ENTRY_GZIP_BUDGET_BYTES = 134_000;

export function entryChunkPath(distDir) {
  const html = readFileSync(path.join(distDir, "index.html"), "utf8");
  const match = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
  if (!match) throw new Error(`no module <script src> in ${distDir}/index.html`);
  return path.join(distDir, match[1].replace(/^\//, ""));
}

export function entryGzipBytes(distDir) {
  return gzipSync(readFileSync(entryChunkPath(distDir)), { level: 9 }).length;
}

/** Returns { ok, bytes, budget, file }; throws when the entry chunk cannot be found. */
export function checkEntryBudget(distDir, budget = ENTRY_GZIP_BUDGET_BYTES) {
  const bytes = entryGzipBytes(distDir);
  return { ok: bytes <= budget, bytes, budget, file: entryChunkPath(distDir) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? fileURLToPath(new URL("../frontend/dist", import.meta.url));
  let result;
  try {
    result = checkEntryBudget(dist);
  } catch (err) {
    console.error(`x bundle-size check could not run: ${err.message}`);
    process.exit(1);
  }
  const { ok, bytes, budget, file } = result;
  console.log(`entry chunk ${path.basename(file)}: ${bytes} B gzip (budget ${budget})`);
  if (!ok) {
    console.error(
      `x entry chunk is ${bytes - budget} B over its gzip budget. Trim the entry or raise the budget deliberately in scripts/check-bundle-size.mjs.`,
    );
    process.exit(1);
  }
}
