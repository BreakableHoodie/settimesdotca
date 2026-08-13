#!/usr/bin/env node
/**
 * delegate-verify — run a delegated coding task and judge it by what actually
 * changed on disk, not by what the tool said.
 *
 * Why this exists
 * ---------------
 * On 2026-08-13 an agy (Antigravity/Gemini) delegation reported exit code 0 and
 * `AGY_USAGE {"status":"SUCCESS"}` while touching zero files: headless agy had
 * no `write_file` grant, so it described the work instead of doing it and still
 * "succeeded". 96,825 tokens, nothing to show, and nothing in the tool's own
 * output said so. `git status` was the only signal that told the truth.
 *
 * That failure mode is not agy-specific. Any delegate — OpenCode, a subagent, a
 * remote runner — can report success after a permission denial, a silent
 * refusal, or a scratch-directory write. So the rule this encodes is general:
 *
 *   A delegation that changed no files did not succeed, whatever it claims.
 *
 * It also enforces the other half of the delegation contract from CLAUDE.md:
 * the delegate never commits. The orchestrator reviews the diff and commits.
 * A delegate that moves HEAD has skipped the review step entirely.
 *
 * Usage
 * -----
 *   node scripts/delegate-verify.mjs -- <command> [args...]
 *   node scripts/delegate-verify.mjs --allow-empty -- <command> [args...]
 *
 * Examples:
 *   node scripts/delegate-verify.mjs -- agy-delegate --tier flash --digest - < brief.md
 *   node scripts/delegate-verify.mjs -- node .agents/skills/opencode-delegate/relay.mjs --brief brief.md
 *
 * Exit codes:
 *   0  command succeeded AND the working tree changed
 *   1  command itself failed (its exit code is reported)
 *   2  command "succeeded" but changed nothing  <- the silent-no-op case
 *   3  the delegate committed, which it must never do
 *   4  usage error
 */

import { spawn, execFileSync } from "node:child_process";

const USAGE = `Usage: node scripts/delegate-verify.mjs [--allow-empty] -- <command> [args...]`;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * `git status --porcelain` covers tracked modifications AND untracked files,
 * which matters: a delegate that creates a brand-new file has done real work,
 * and a `git diff`-only check would call that a no-op.
 */
function snapshot() {
  return {
    head: git(["rev-parse", "HEAD"]),
    status: git(["status", "--porcelain"]),
  };
}

function parseStatus(porcelain) {
  const entries = new Map();
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    // Porcelain v1: 2 status chars, a space, then the path. Renames render as
    // "old -> new"; the destination is what matters for "what changed".
    const code = line.slice(0, 2);
    const path = line.slice(3).split(" -> ").pop();
    entries.set(path, code);
  }
  return entries;
}

function diffSnapshots(before, after) {
  const b = parseStatus(before.status);
  const a = parseStatus(after.status);
  const changed = [];
  for (const [path, code] of a) {
    if (b.get(path) !== code) changed.push({ path, code });
  }
  // A path that was dirty before and is clean now also counts as a change
  // (e.g. the delegate reverted something).
  for (const path of b.keys()) {
    if (!a.has(path)) changed.push({ path, code: "--" });
  }
  return changed.sort((x, y) => x.path.localeCompare(y.path));
}

function main() {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) {
    console.error(USAGE);
    process.exit(4);
  }

  const flags = argv.slice(0, sep);
  const allowEmpty = flags.includes("--allow-empty");
  const unknown = flags.filter((f) => f !== "--allow-empty");
  if (unknown.length) {
    console.error(`delegate-verify: unknown flag(s): ${unknown.join(", ")}\n${USAGE}`);
    process.exit(4);
  }

  const [cmd, ...args] = argv.slice(sep + 1);
  const before = snapshot();

  // stdio inherited so the delegate's own output, prompts and stdin-fed briefs
  // pass through untouched — this wraps the run, it does not intercept it.
  const child = spawn(cmd, args, { stdio: "inherit" });

  child.on("error", (err) => {
    console.error(`delegate-verify: could not run "${cmd}": ${err.message}`);
    process.exit(1);
  });

  child.on("close", (code) => {
    const after = snapshot();
    const changed = diffSnapshots(before, after);

    console.error("\n─── delegate-verify ───");

    if (after.head !== before.head) {
      console.error(`FAIL: the delegate committed (HEAD ${before.head.slice(0, 7)} -> ${after.head.slice(0, 7)}).`);
      console.error("Delegates must never commit — the orchestrator reviews the diff and commits.");
      console.error(`Recover with: git reset --soft ${before.head}`);
      process.exit(3);
    }

    if (code !== 0) {
      console.error(`FAIL: command exited ${code}.`);
      console.error(`Files changed anyway: ${changed.length} (inspect before retrying — partial work may remain).`);
      process.exit(1);
    }

    if (changed.length === 0) {
      if (allowEmpty) {
        console.error("OK: no files changed, and --allow-empty was passed (read-only task).");
        process.exit(0);
      }
      console.error("FAIL: command reported success but changed no files.");
      console.error("A delegation that changed nothing did not succeed, whatever it reported.");
      console.error("Most likely a missing write permission — the delegate described the work instead of doing it.");
      console.error("Check the tool's write grant, then re-run. Pass --allow-empty if this really was read-only.");
      process.exit(2);
    }

    console.error(`OK: ${changed.length} file(s) changed.`);
    for (const { path, code: c } of changed) {
      console.error(`  ${c}  ${path}`);
    }
    console.error("Review the diff and run the project gate before committing.");
    process.exit(0);
  });
}

main();
