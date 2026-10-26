import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
      [
        "package.json",
        "package-lock.json",
        "playwright.config.js",
        "e2e/utils/**",
        "frontend/**",
        ".github/actions/apt-deb-cache/**",
      ],
    ],
    [
      "edge-e2e.yml",
      [
        "package.json",
        "package-lock.json",
        "frontend/package.json",
        "frontend/package-lock.json",
        "playwright.config.js",
        ".github/actions/apt-deb-cache/**",
      ],
    ],
  ])("%s triggers on its dependencies", (workflow, required) => {
    const paths = prPaths(workflow);
    for (const path of required) expect(paths, `${workflow} is missing ${path}`).toContain(path);
  });
});

// dorny/paths-filter reads each filter as a pattern or a LIST of patterns. A
// YAML `|` block is one string with newlines in it, which matches no file:
// e2e-tests.yml's `schema` and `ci` filters were dead that way from #457 to
// #1391, so a migration-only PR never ran the E2E suite.
const pathsFilterSteps = () =>
  readdirSync(join(REPO_ROOT, ".github/workflows"))
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((workflow) => {
      const doc = loadYaml(readFileSync(join(REPO_ROOT, ".github/workflows", workflow), "utf8"));
      return Object.values(doc.jobs ?? {})
        .flatMap((job) => job.steps ?? [])
        .filter((step) => String(step.uses ?? "").startsWith("dorny/paths-filter@"))
        .map((step) => ({ workflow, step, filters: loadYaml(step.with.filters) }));
    });

describe("dorny/paths-filter filters", () => {
  it("finds the filters it checks", () => {
    expect(pathsFilterSteps().map((s) => s.workflow)).toEqual(
      expect.arrayContaining(["e2e-tests.yml", "cloudflare-pages.yml"]),
    );
  });

  it("are single patterns or lists, never a multi-line string", () => {
    for (const { workflow, filters } of pathsFilterSteps()) {
      for (const [name, value] of Object.entries(filters)) {
        const patterns = Array.isArray(value) ? value : [value];
        for (const pattern of patterns) {
          expect(typeof pattern, `${workflow} filter ${name}`).toBe("string");
          expect(pattern, `${workflow} filter ${name} is a multi-line string, not a list`).not.toMatch(/\n/);
        }
      }
    }
  });

  it("e2e-tests.yml runs on schema, CI and dependency changes", () => {
    const { filters } = pathsFilterSteps().find((s) => s.workflow === "e2e-tests.yml");
    const all = Object.values(filters).flat();
    for (const path of [
      "migrations/**",
      "database/**",
      ".github/actions/e2e-env/**",
      ".github/actions/apt-deb-cache/**",
      "package-lock.json",
      "frontend/package-lock.json",
      "playwright.config.js",
    ]) {
      expect(all, `e2e-tests.yml is missing ${path}`).toContain(path);
    }
  });
});
