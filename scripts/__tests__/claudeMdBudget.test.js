/**
 * Guard: CLAUDE.md stays inside its share of Claude Code's instruction budget.
 *
 * Claude Code warns once the instruction files it loads add up to more than
 * 150,000 characters, and this repo's CLAUDE.md is loaded alongside the
 * owner's global ~/.claude/CLAUDE.md (~12k). Twice the warning was the first
 * anyone heard of it: #1326 (2026-10-16) trimmed the file under the limit, and
 * it was back over by 2026-10-24, eight days of ordinary PRs later. A harness
 * warning nobody reads in CI is not a gate; this is.
 *
 * The budget leaves room for the global file plus headroom, so the failure
 * arrives in the PR that grows the file, not in a later session. When it
 * fails, do not raise the number: move history, incidents and measurements
 * into docs/field-notes/ (verbatim) and keep only the rules here, as #1326
 * and the 2026-10-24 pass did.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const claudeMd = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");

const BUDGET_CHARS = 125_000;

// Characters, not bytes or UTF-16 units: the file is full of em dashes and
// arrows, so `Buffer.byteLength` overcounts and `.length` can drift.
const chars = (text) => [...text].length;

describe("CLAUDE.md size budget", () => {
  it("counts characters, not bytes", () => {
    expect(chars("— → ≤")).toBe(5);
    expect(Buffer.byteLength("— → ≤")).toBeGreaterThan(5);
  });

  it(`stays under ${BUDGET_CHARS} characters`, () => {
    const size = chars(claudeMd);
    expect(
      size,
      `CLAUDE.md is ${size} characters, over its ${BUDGET_CHARS} budget. Move history into docs/field-notes/; keep the rules.`,
    ).toBeLessThanOrEqual(BUDGET_CHARS);
  });
});
