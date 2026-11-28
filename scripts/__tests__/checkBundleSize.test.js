import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { checkEntryBudget, entryGzipBytes, ENTRY_GZIP_BUDGET_BYTES } from "../check-bundle-size.mjs";

const SCRIPT = fileURLToPath(new URL("../check-bundle-size.mjs", import.meta.url));
let dist;

beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), "bundle-size-"));
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(
    path.join(dist, "index.html"),
    '<script>x</script><script type="module" crossorigin src="/assets/index-abc.js"></script>',
  );
  // Incompressible bytes, so the gzip size is well above zero and known.
  writeFileSync(path.join(dist, "assets", "index-abc.js"), randomBytes(5000));
  writeFileSync(path.join(dist, "assets", "other.js"), randomBytes(900000));
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe("check-bundle-size (#1499)", () => {
  it("measures the entry chunk named by index.html, not the biggest file", () => {
    const bytes = entryGzipBytes(dist);
    expect(bytes).toBeGreaterThan(4000);
    expect(bytes).toBeLessThan(6000);
  });

  it("passes at the measured size and fails once the budget is below it", () => {
    const bytes = entryGzipBytes(dist);
    expect(checkEntryBudget(dist, bytes).ok).toBe(true);
    expect(checkEntryBudget(dist, bytes - 1).ok).toBe(false);
  });

  it("the CLI exits 1 on a bloated entry chunk", () => {
    const bloated = mkdtempSync(path.join(tmpdir(), "bundle-size-big-"));
    try {
      mkdirSync(path.join(bloated, "assets"));
      writeFileSync(path.join(bloated, "index.html"), '<script type="module" src="/assets/e.js"></script>');
      writeFileSync(path.join(bloated, "assets", "e.js"), randomBytes(ENTRY_GZIP_BUDGET_BYTES + 5000));
      const r = spawnSync("node", [SCRIPT, bloated], { encoding: "utf8" });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("over its gzip budget");
    } finally {
      rmSync(bloated, { recursive: true, force: true });
    }
  });

  it("fails (not skips) when index.html names no module script", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "bundle-size-none-"));
    try {
      writeFileSync(path.join(empty, "index.html"), "<html></html>");
      const r = spawnSync("node", [SCRIPT, empty], { encoding: "utf8" });
      expect(r.status).toBe(1);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("the real budget leaves the 2026-11-27 measurement (121,703 B) inside it", () => {
    expect(ENTRY_GZIP_BUDGET_BYTES).toBeGreaterThan(121_703);
  });
});
