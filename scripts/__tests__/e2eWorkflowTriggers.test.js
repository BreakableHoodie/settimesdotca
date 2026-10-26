import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

// A path-filtered E2E job must run when what it depends on changes, not only
// when app code does. #1379 moved axe-core 4.13 -> 4.14 in the root lockfile;
// e2e-a11y-visual did not run on it, and the new rule failed the next
// frontend PR instead.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const prPaths = (workflow) =>
  loadYaml(readFileSync(join(REPO_ROOT, ".github/workflows", workflow), "utf8")).on.pull_request.paths;

describe("path-filtered E2E jobs run on dependency changes", () => {
  it.each([
    [
      "e2e-a11y-visual.yml",
      ["package.json", "package-lock.json", "playwright.config.js", "e2e/utils/**", "frontend/**"],
    ],
    [
      "edge-e2e.yml",
      [
        "package.json",
        "package-lock.json",
        "frontend/package.json",
        "frontend/package-lock.json",
        "playwright.config.js",
      ],
    ],
  ])("%s triggers on its dependencies", (workflow, required) => {
    const paths = prPaths(workflow);
    for (const path of required) expect(paths, `${workflow} is missing ${path}`).toContain(path);
  });
});
