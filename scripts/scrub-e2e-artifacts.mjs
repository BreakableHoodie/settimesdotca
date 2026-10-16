#!/usr/bin/env node
// Make Playwright output safe to upload from a PUBLIC repository.
//
// Playwright has no masking for typed values. A `fill()` puts the value in the
// step title, the trace's recorded params and the failure page snapshot, so a
// failed login uploaded the E2E admin password in plain text. On 2026-10-15
// 12 artifacts were found holding it, downloadable by any signed-in GitHub
// user, and the secret was rotated.
//
// What this does, for each directory given:
//   1. Deletes traces (*.zip, *.trace, *.network), HTML files and symlinks. Traces
//      and HTML hold archives or base64 that cannot be scrubbed in place.
//   2. Replaces every occurrence of each secret in the remaining files.
//   3. Re-reads EVERY remaining file, binary included, and exits 1 if a secret
//      or an archive survives. The workflow uploads only when this step
//      succeeded, so a scrub that breaks fails closed instead of uploading.
//
// What survives is what diagnosis needs: error-context.md, failure screenshots
// (password inputs render as dots) and visual-regression diff PNGs.
//
// Secrets come from SCRUB_SECRETS (newline-separated), never argv, so they do
// not reach the process list or the job log.

import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// HTML is dropped, never scanned: an attachment can carry the secret as base64.
const DROP_FILE = /\.(zip|trace|network|html?)$/i;
const DROP_DIR = new Set(["trace", "data"]); // Playwright trace and HTML-report payloads

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Every spelling of a secret that can land in a text artifact, as the UTF-8
// BYTES a file would hold. Matching on bytes, not on a decoded string, is what
// keeps a non-ASCII secret findable in a binary-safe pass.
function forms(secret) {
  const spellings = new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]);
  return [...spellings].map((s) => Buffer.from(s, "utf8"));
}

const REDACTED = Buffer.from("[REDACTED]");

function replaceAll(buf, needle) {
  const parts = [];
  let from = 0;
  for (let at = buf.indexOf(needle); at !== -1; at = buf.indexOf(needle, from)) {
    parts.push(buf.subarray(from, at), REDACTED);
    from = at + needle.length;
  }
  if (from === 0) return null;
  parts.push(buf.subarray(from));
  return Buffer.concat(parts);
}

export function scrub(dirs, secrets) {
  // Secrets are used exactly as given: trimming " abc " would scrub "abc" and
  // leave the real value behind. Only empty entries are dropped.
  const live = secrets.filter((s) => s !== "");
  if (live.length === 0) throw new Error("no secret to scrub: refusing to declare the artifacts clean");
  const needles = live.flatMap(forms);

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    // An HTML report embeds every step title in a base64 zip; drop it whole.
    if (existsSync(path.join(dir, "index.html")) && path.basename(dir) === "playwright-report") {
      rmSync(dir, { recursive: true, force: true });
      continue;
    }
    for (const sub of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      const full = path.join(sub.parentPath ?? sub.path, sub.name);
      if (sub.isDirectory() && DROP_DIR.has(sub.name)) rmSync(full, { recursive: true, force: true });
    }
    for (const file of walk(dir)) {
      // A symlink is removed, never read: reading follows it, and the redacted
      // write would land on its target outside these directories.
      if (lstatSync(file).isSymbolicLink() || DROP_FILE.test(file)) {
        rmSync(file, { force: true });
        continue;
      }
      let bytes = readFileSync(file);
      let changed = false;
      for (const needle of needles) {
        const next = replaceAll(bytes, needle);
        if (next) {
          bytes = next;
          changed = true;
        }
      }
      if (changed) writeFileSync(file, bytes);
    }
  }

  // Verify by reading back, never by trusting the loop above.
  const leaks = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) leaks.push(`${file}: symlink survived`);
      else if (DROP_FILE.test(file)) leaks.push(`${file}: archive or report survived`);
      else if (stat.isFile()) {
        const bytes = readFileSync(file);
        if (needles.some((n) => bytes.includes(n))) leaks.push(`${file}: secret survived`);
      }
    }
  }
  return leaks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  // Split on CRLF too, but never trim: whitespace may be part of a password.
  const secrets = (process.env.SCRUB_SECRETS ?? "").split(/\r?\n/);
  try {
    const leaks = scrub(dirs, secrets);
    if (leaks.length > 0) {
      for (const leak of leaks) console.error(`::error::${leak}`);
      process.exit(1);
    }
    console.log(`Scrubbed ${dirs.join(", ")}: no secret, trace or report remains.`);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
