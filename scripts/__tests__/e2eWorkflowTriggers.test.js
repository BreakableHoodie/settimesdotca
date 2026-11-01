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
const workflowDoc = (workflow) => loadYaml(readFileSync(join(REPO_ROOT, ".github/workflows", workflow), "utf8"));
// edge-e2e.yml filters in a `changes` job rather than on the trigger (#1410).
const prPaths = (workflow) => {
  const doc = workflowDoc(workflow);
  const filterStep = doc.jobs?.changes?.steps?.find((step) =>
    String(step.uses ?? "").startsWith("dorny/paths-filter@"),
  );
  return filterStep ? loadYaml(filterStep.with.filters).edge : doc.on.pull_request.paths;
};

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
        ".github/actions/playwright-image/**",
      ],
    ],
    [
      "edge-e2e.yml",
      [
        // index.html, public/_headers and vite.config.js deploy too, not only src/.
        "frontend/**",
        "scripts/wait-for-preview.mjs",
        "scripts/e2e-totp.mjs",
        "scripts/smoke-probes.mjs",
        "scripts/seed-e2e-admin.mjs",
        "scripts/scrub-e2e-artifacts.mjs",
        "package.json",
        "package-lock.json",
        "frontend/package.json",
        "frontend/package-lock.json",
        "playwright.config.js",
        ".github/actions/playwright-image/**",
      ],
    ],
  ])("%s triggers on its dependencies", (workflow, required) => {
    const paths = prPaths(workflow);
    for (const path of required) expect(paths, `${workflow} is missing ${path}`).toContain(path);
  });
});

// "Preview edge E2E" is a required check (#1410). A required check must report
// on every PR, so the workflow cannot be path-filtered on its trigger, and a
// failed `changes` job must run the suite: a skip would pass the check.
describe("edge-e2e.yml can be a required check", () => {
  const doc = () => workflowDoc("edge-e2e.yml");

  it("triggers on every pull request, with no path filter", () => {
    const trigger = doc().on.pull_request;
    expect(trigger?.paths).toBeUndefined();
    expect(trigger?.["paths-ignore"]).toBeUndefined();
  });

  it("runs the suite when it cannot tell what changed", () => {
    const job = doc().jobs["edge-e2e"];
    expect(job.needs).toContain("changes");
    expect(job.if).toContain("needs.changes.result != 'success'");
    expect(job.if).toContain("needs.changes.outputs.edge == 'true'");
    // A failed image job must not skip the suite either (a skip passes the check).
    expect(job.if).not.toContain("needs.playwright-image.result");
  });

  it("queues only the deploying job on the shared scratch D1", () => {
    const d = doc();
    expect(d.concurrency).toBeUndefined();
    expect(d.jobs["edge-e2e"].concurrency).toEqual({ group: "edge-e2e", "cancel-in-progress": false, queue: "max" });
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
      ".github/actions/playwright-image/**",
      "package-lock.json",
      "frontend/package-lock.json",
      "playwright.config.js",
    ]) {
      expect(all, `e2e-tests.yml is missing ${path}`).toContain(path);
    }
  });
});
