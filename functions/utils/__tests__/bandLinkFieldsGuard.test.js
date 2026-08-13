import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// --- Durable guard: no private hand-listing of band link-platform keys --------
//
// CLAUDE.md "two canonical homes" pattern (mirrors
// afterMidnightThreshold.test.js and eventVisibility.test.js): band social-link
// platform keys have exactly ONE server-side home — `BAND_LINK_FIELD_KEYS` in
// functions/utils/bandLinkFields.js — because Cloudflare Pages Functions
// cannot import the frontend home (`LINK_FIELDS` in
// frontend/src/admin/utils/bandFields.js). Until #779, two public read
// endpoints each hand-built the SAME `social` object literal against the
// output of `safeReflectSocialLinks(...)`: `/api/bands/{name}` listed FOUR of
// the eight platforms and silently dropped youtube, spotify, apple_music and
// linktree, while `/api/bands/stats/{name}` listed all eight. The two had
// already diverged and could again. Both now iterate the single constant; a
// runtime assertion on the response (in functions/api/bands/__tests__/profile.test.js)
// pins the public key SET to the canonical eight. This guard is the
// source-side complement: it keeps a hand-written key list from creeping back
// into `functions/`, so the two cannot re-diverge.
//
// Why this scan is tractable here, and not noisy:
//
// The defect's fingerprint is specific: a RESPONSE builder reads the parsed
// social-links object via a dotted property access like `socialLinks.youtube`
// — naming each platform by hand. After the fix, both endpoints build `social`
// with `Object.fromEntries(BAND_LINK_FIELD_KEYS.map((key) => [key, socialLinks[key] || null]))`,
// which uses a COMPUTED property access (`socialLinks[key]`) and names no
// platform. Scanning for the dotted form `socialLinks\.<platformkey>` catches
// the exact pattern that caused #779 and ignores the fixed code, with zero
// false positives across `functions/`:
//
//   - `safeReflectSocialLinks` (functions/utils/validation.js) iterates with
//     `Object.entries` and never names a platform. Not flagged.
//   - `sanitizeBandSocialLinks` / `sanitizeEventSocialLinks`
//     (functions/utils/validation.js) — the WRITE-path sanitizers — enumerate
//     per-field validators, but they read `parsed.website`, `parsed.instagram`,
//     etc., NOT `socialLinks.website`. Not flagged.
//   - The canonical home itself (bandLinkFields.js) declares the keys as
//     string literals in an array, never as a property access on a
//     `socialLinks` object. Not flagged.
//
// A hand-listed RESPONSE builder anywhere in `functions/` (the bug class) WILL
// be flagged the moment it touches the parsed object by dotted platform name.
// This is the exact defect #779 fixes, scanned narrowly enough to stay silent
// on everything else in the tree.
//
// KNOWN GAP — this guard is NAME-ANCHORED and therefore not airtight, the same
// way afterMidnightThreshold.test.js's numeric half is (CLAUDE.md says so in
// as many words). It matches the identifier `socialLinks` specifically, so a
// hand-listed copy written against a differently-named binding —
// `const links = safeReflectSocialLinks(...)` then `links.youtube` — slips
// past. Widening it to `\w+\.(?:website|instagram|…)` would flag the write-path
// sanitizers' `parsed.website` and every unrelated `.website` in the tree,
// which is pure noise; the variable name is the only tractable signal for this
// shape. Treat this as a backstop against the copy-paste that ACTUALLY
// happened (#779 — both offending files used `socialLinks`), not as proof that
// no third hand-listed copy can exist. The response-contract tests in
// profile.test.js are the independent, name-blind half of the net: they assert
// the public key set regardless of how the object was built.

// Module-level so the walker is shared. .ts is scanned even though functions/
// is currently JS-only — a guard that silently stops covering a file type the
// day someone adds one is the exact failure mode guards exist to prevent
// (same rationale as afterMidnightThreshold.test.js).
const SCANNED_EXTENSIONS = [".js", ".ts"];

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const currentFile = fileURLToPath(import.meta.url);
const functionsRoot = path.join(path.dirname(currentFile), "../../");

// The one canonical server-side home. Its own declaration of
// `BAND_LINK_FIELD_KEYS = [...]` lists the platform strings as array literals,
// never as `socialLinks.<key>`, so it is exempt by path.
const CANONICAL_HOME = "utils/bandLinkFields.js";

function isExempt(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === CANONICAL_HOME) return true;
  if (normalized.split("/").includes("__tests__")) return true;
  return false;
}

describe("no hand-listed band link-platform keys outside bandLinkFields.js", () => {
  // Matches a dotted property read of a canonical platform key off a variable
  // named like `socialLinks` — the response-builder fingerprint of #779.
  // Anchored to the variable name `socialLinks` (case-sensitive) so the
  // write-path sanitizers in validation.js, which dereference `parsed.<key>`,
  // are not flagged. The platform alternation is the canonical eight; a
  // newly-documented platform added to BAND_LINK_FIELD_KEYS should be added
  // here in the same PR so the guard keeps covering it.
  const PLATFORM_KEYS = [
    "website",
    "instagram",
    "bandcamp",
    "facebook",
    "youtube",
    "spotify",
    "apple_music",
    "linktree",
  ];
  // No escaping needed: every canonical key is [a-z_] only, and `_` is not a
  // regex metacharacter. If a future platform key ever contains one (a dot or
  // a dash), escape it here.
  const DOTTED_ACCESS_RE = new RegExp(`\\bsocialLinks\\.(?:${PLATFORM_KEYS.join("|")})\\b`);

  it("has no file reading socialLinks by a hand-listed platform key outside bandLinkFields.js", () => {
    const offenders = [];
    for (const absPath of walk(functionsRoot)) {
      const relPath = path.relative(functionsRoot, absPath).split(path.sep).join("/");
      if (isExempt(relPath)) continue;

      const source = readFileSync(absPath, "utf8");
      if (DOTTED_ACCESS_RE.test(source)) {
        offenders.push(relPath);
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `These files read the parsed social-links object by a hand-listed platform key ` +
            `(\`socialLinks.<platform>\`): ${offenders.join(", ")}. Build the response \`social\` object from ` +
            `\`BAND_LINK_FIELD_KEYS\` in functions/utils/bandLinkFields.js instead — there is exactly one ` +
            `server-side canonical home for the platform list, never a per-endpoint copy. See CLAUDE.md ` +
            `"two canonical homes" pattern and issue #779.`
        : undefined,
    ).toEqual([]);
  });
});
