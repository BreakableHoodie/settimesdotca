import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// --- Durable guard: no hardcoded city literal in SSR venue/event surfaces
// ------------------------------------------------------------------------
//
// #840: #767 removed the hardcoded "Waterloo" from frontend directions, but the
// class stayed live on four SSR surfaces — the venue page <title> and its
// MusicVenue JSON-LD, the event page MusicVenue addressLocality, and
// ssrMeta.js's WATERLOO_ADDRESS constant — each asserting "Waterloo" for venues
// whose own city (e.g. Buddies Fest 2's Tillsonburg venues) said otherwise.
// That is false structured data on a repo where SEO is a priority.
//
// The fix threads each venue's own city through and omits the locality when it
// is absent (vague but never wrong). This source scan (same technique as
// functions/utils/__tests__/afterMidnightThreshold.test.js and
// eventVisibility.test.js) keeps a hardcoded city literal from creeping back
// into the files that build SSR identity meta / JSON-LD.
//
// Deliberate scope: "Waterloo Region" (a REGION) stays allowed — the platform's
// stated focus, used as product-language fallback copy — while the bare city
// literal "Waterloo" (and any other hardcoded city) is the defect. The lookahead
// below is that line: `Waterloo(?!\s+Region)` matches the city claim and not the
// region fallback. Line-level heuristic, not a JS parser — same caveat as the
// "06:00" guard: it misses a literal assembled across string concatenations and
// flags a non-comment line that merely mentions the city; there is no such
// legitimate string in these files today, and one appearing would be worth a
// human's attention regardless.

const SCANNED_EXTENSIONS = [".js", ".ts"];

// The three surface families #840 covered: venue SSR, event SSR, and the shared
// ssrMeta helper they both import from.
const TARGETS = [
  path.join("functions", "venue"),
  path.join("functions", "event"),
  path.join("functions", "utils", "ssrMeta.js"),
];

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.join(path.dirname(currentFile), "../../../");

function isCommentLine(trimmed) {
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function isExempt(relPath) {
  // Test files necessarily name the literal; the snapshots and spec fixtures
  // describe Waterloo venues. Only the production surfaces are in scope.
  return relPath.split(path.sep).join("/").split("/").includes("__tests__");
}

function scanFile(absPath, relPath, offenders) {
  if (isExempt(relPath)) return;
  const source = readFileSync(absPath, "utf8");
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isCommentLine(trimmed)) continue;
    // A bare "Waterloo" NOT part of "Waterloo Region". The lookahead is the
    // whole precision of this guard: the platform's focus copy ("Waterloo
    // Region" as a REGION) stays legal; the CITY claim (addressLocality,
    // titles, `|| "Waterloo"` fallbacks) is the defect. Line-level and
    // name-based — it catches the exact copy-paste that shipped in #840 and
    // misses a literal built across concatenations, same caveat as the
    // AFTER_MIDNIGHT threshold guard.
    if (/\bWaterloo\b(?!\s+Region)/.test(trimmed)) {
      offenders.push(`${relPath}:${i + 1}`);
    }
  }
}

describe("no hardcoded city literal in SSR venue/event surfaces (#840)", () => {
  it("has no hardcoded city string in functions/venue/, functions/event/, or ssrMeta.js", () => {
    const offenders = [];

    for (const target of TARGETS) {
      const absTarget = path.join(repoRoot, target);
      if (target.endsWith(".js")) {
        scanFile(absTarget, target, offenders);
        continue;
      }
      if (!readdirSync(absTarget, { withFileTypes: true })) continue;
      const stack = [absTarget];
      while (stack.length > 0) {
        const dir = stack.pop();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          const rel = path.relative(repoRoot, full);
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
            scanFile(full, rel, offenders);
          }
        }
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `These lines hardcode a city literal instead of threading the venue's own city through ` +
            `(or naming a Region): ${offenders.join(", ")}. Thread venue.city / event.city and omit the ` +
            `locality when it is absent — see #840 and functions/utils/__tests__/hardcodedCityGuard.test.js.`
        : undefined,
    ).toEqual([]);
  });
});
