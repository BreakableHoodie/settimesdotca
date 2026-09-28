#!/usr/bin/env node
/**
 * CLAUDE.md cites ~250 repository paths in backticks. Nothing checked that they
 * still resolve, so a renamed or deleted file left the prose confidently wrong
 * while every existing gate stayed green: the citation test (mutationGateCitations)
 * proves a cited HEADING exists, and the mutation gate proves a guarded BEHAVIOUR
 * still fails when broken. Neither reads the prose underneath.
 *
 * That gap was live. `admin/components/DataGapFilter.jsx` was named as a current
 * consumer of the bandFields registry long after `LinksColumnFilter.jsx` superseded
 * it -- the replacement's own header said so, and CLAUDE.md did not.
 *
 * A path that does not resolve is not automatically a defect: this file documents
 * deleted workflows, per-machine tooling and build artifacts by name, on purpose.
 * Those live in KNOWN_ABSENT with a reason each, which is the same discipline as
 * the mutation gate's KNOWN_SURVIVING -- an unexplained absence fails, an explained
 * one is a line of prose someone had to write.
 *
 * Exit codes: 0 clean · 1 unexplained citation(s) · 2 the scan went blind · 3 usage.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Paths CLAUDE.md names that are SUPPOSED to be absent. Each needs a reason a
 * reader can check. Deleting an entry is how you re-open the question.
 */
const KNOWN_ABSENT = new Map([
  ["semgrep.yml", "removed 2026-09-16; documented as leaving a false-green check (#1173)"],
  ["relay.mjs", "opencode-delegate is per-machine and gitignored; a fresh clone has none"],
  ["result.json", "runtime artifact a delegation writes; never committed"],
  ["DataGapFilter.jsx", "superseded by LinksColumnFilter.jsx; cited as history"],
  ["/_routes.json", "the stale root copy removed in #786; CLAUDE.md says do not recreate it"],
  ["dist/index.html", "build output; produced by `npm run build`, never committed"],
  ["sessions/", "a directory fragment inside a table cell, not a full path"],
  ["admin/", "a directory fragment inside a table cell, not a full path"],
  [".claude/settings.local.json", "machine-local Claude settings; intentionally not committed"],
  ["instructions/", "legacy path; the tracked instruction files live under .github/instructions/"],
  [".agents/skills/", "per-machine delegated skills directory; intentionally gitignored"],
  ["coverage/coverage-final.json", "produced by `npm run test:coverage`, never committed; absent in a fresh clone"],
]);

/**
 * If the classifier stops recognising citations it reports a clean run while
 * checking nothing -- the `lint-md`-missing-from-`.PHONY` failure. These floors
 * are well under the real counts (~56 sections, ~250 citations) so ordinary
 * editing never trips them, but a broken matcher does.
 */
const MIN_SECTIONS = 40;
const MIN_CITATIONS = 150;

const EXT = /\.(js|jsx|mjs|cjs|json|md|sql|ya?ml|toml|css|html|sh)$/;

/** Backticked spans are also code, routes, regexes and Tailwind classes. Only keep path shapes. */
function isRepoPathShape(raw) {
  if (raw.includes(" ") || raw.includes("*") || raw.includes("…") || raw.includes("<")) return false;
  if (raw.startsWith("http")) return false;
  if (/^\/.*\/[gimsuy]*$/.test(raw) && !EXT.test(raw)) return false; // /regex/
  if (/^(text|bg|border|ring|hover|focus)-/.test(raw)) return false; // Tailwind
  if (/^\/(api|event|events|band|venue|artists|admin|s)\b/.test(raw) && !EXT.test(raw)) return false; // URL route
  if (/^\/(var|etc|usr|tmp)\//.test(raw)) return false; // host path
  if (raw.includes(":") && !raw.includes("/")) return false; // label:value
  if (/^[a-z]+\/[a-z]+$/.test(raw) && !EXT.test(raw)) return false; // try/finally
  return EXT.test(raw) || raw.endsWith("/");
}

function parseSections(lines) {
  const sections = [];
  let cur = null;
  lines.forEach((line, i) => {
    const m = /^(#{2,3}) (.+)$/.exec(line);
    if (m) {
      if (cur) sections.push(cur);
      cur = { heading: m[2], line: i + 1, body: [] };
    } else if (cur) cur.body.push(line);
  });
  if (cur) sections.push(cur);
  return sections;
}

function main() {
  const mdPath = join(ROOT, "CLAUDE.md");
  if (!existsSync(mdPath)) {
    console.error("FAIL: CLAUDE.md not found -- run this from the repository.");
    process.exit(3);
  }

  // Tracked AND untracked-but-not-ignored, matching `make gate`'s file lists: a
  // brand-new file you have not `git add`ed is the one most likely to be cited.
  const index = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT })
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const byBasename = new Map();
  for (const f of index) {
    const b = basename(f);
    if (!byBasename.has(b)) byBasename.set(b, []);
    byBasename.get(b).push(f);
  }

  const sections = parseSections(readFileSync(mdPath, "utf8").split("\n"));
  const unexplained = [];
  const explained = [];
  let citationCount = 0;

  for (const section of sections) {
    const seen = new Set();
    for (const m of section.body.join("\n").matchAll(/`([^`\n]+)`/g)) {
      const raw = m[1].replace(/^\.\//, "").replace(/:\d+$/, "").trim();
      if (isRepoPathShape(raw)) seen.add(raw);
    }
    for (const cited of seen) {
      citationCount++;
      const clean = cited.replace(/\/$/, "");
      if (existsSync(join(ROOT, clean))) continue;
      // CLAUDE.md often cites a path relative to functions/ or frontend/src/.
      const hits = byBasename.get(basename(clean)) || [];
      if (hits.length && (!clean.includes("/") || hits.some((h) => h.endsWith(`/${clean}`)))) continue;

      const entry = { cited, heading: section.heading, line: section.line };
      if (KNOWN_ABSENT.has(cited)) explained.push(entry);
      else unexplained.push(entry);
    }
  }

  if (sections.length < MIN_SECTIONS || citationCount < MIN_CITATIONS) {
    console.error(
      `FAIL: the scan went blind -- ${sections.length} sections (min ${MIN_SECTIONS}), ` +
        `${citationCount} citations (min ${MIN_CITATIONS}). The matcher is broken, not the document.`,
    );
    process.exit(2);
  }

  console.log(`sections ${sections.length} · citations ${citationCount} · explained absences ${explained.length}`);

  if (unexplained.length) {
    console.error(`\nFAIL: ${unexplained.length} cited path(s) do not exist and are not explained:\n`);
    for (const u of unexplained) {
      console.error(`  ${u.cited}`);
      console.error(`    CLAUDE.md:${u.line}  ${u.heading.slice(0, 72)}`);
    }
    console.error(
      "\nEither the prose is stale (fix it), or the absence is deliberate --\n" +
        "add it to KNOWN_ABSENT in this file with the reason.",
    );
    process.exit(1);
  }

  console.log("OK: every cited path resolves, or is a documented absence.");
}

main();
