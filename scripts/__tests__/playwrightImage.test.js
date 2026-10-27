import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

// Every job that runs Playwright runs in the official Playwright image, named
// from the lockfile's version (#1391). On a hosted runner the browsers' system
// packages came from apt on every run, and a slow mirror failed jobs before a
// single test ran. A hand-typed image tag would drift: Dependabot bumps
// Playwright in the lockfile and cannot bump a `container:` image.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKFLOWS = join(REPO_ROOT, ".github/workflows");
const IMAGE_FROM_JOB = "${{ needs.playwright-image.outputs.image }}";

const workflows = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({ file, doc: loadYaml(readFileSync(join(WORKFLOWS, file), "utf8")) }));

// A job runs Playwright when it installs browsers through e2e-env (the
// default) or calls the Playwright CLI itself.
const runsPlaywright = (job) =>
  (job.steps ?? []).some(
    (step) =>
      (step.uses === "./.github/actions/e2e-env" && step.with?.["install-playwright"] !== "false") ||
      /\bplaywright (install|test)\b/.test(String(step.run ?? "")),
  );

const playwrightJobs = workflows.flatMap(({ file, doc }) =>
  Object.entries(doc.jobs ?? {})
    .filter(([, job]) => runsPlaywright(job))
    .map(([id, job]) => ({ file, doc, id, job })),
);

describe("Playwright jobs run in the lockfile's Playwright image (#1391)", () => {
  it("finds the jobs it checks", () => {
    expect(playwrightJobs.map((j) => `${j.file}:${j.id}`).sort()).toEqual([
      "e2e-a11y-visual.yml:e2e-a11y-visual",
      "e2e-tests.yml:e2e",
      "edge-e2e.yml:edge-e2e",
      "update-visual-snapshots.yml:update-snapshots",
    ]);
  });

  it.each(playwrightJobs.map((j) => [`${j.file}:${j.id}`, j]))("%s", (_, { doc, job }) => {
    expect(job.container?.image).toBe(IMAGE_FROM_JOB);
    expect([job.needs].flat()).toContain("playwright-image");
    const steps = doc.jobs["playwright-image"]?.steps ?? [];
    expect(steps.map((s) => s.uses)).toContain("./.github/actions/playwright-image");
  });

  it("never hard-codes a Playwright image tag", () => {
    for (const { file, doc } of workflows) {
      for (const job of Object.values(doc.jobs ?? {})) {
        const image = typeof job.container === "string" ? job.container : job.container?.image;
        expect(String(image ?? ""), file).not.toMatch(/playwright:v\d/);
      }
    }
  });

  it("names the image from playwright-core, which pins the browser builds", () => {
    const action = readFileSync(join(REPO_ROOT, ".github/actions/playwright-image/action.yml"), "utf8");
    expect(action).toContain('pkgs["node_modules/playwright-core"]');
    expect(action).toContain("mcr.microsoft.com/playwright:v$version-noble");
    const pkgs = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8")).packages;
    expect(pkgs["node_modules/playwright-core"]?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkgs["node_modules/@playwright/test"].version).toBe(pkgs["node_modules/playwright-core"].version);
  });

  // A tag can be re-pushed, and these jobs hold deploy and push credentials.
  // A Dependabot Playwright bump fails here until its digest is added.
  it("pins the lockfile's version to an image digest", () => {
    const digests = JSON.parse(readFileSync(join(REPO_ROOT, ".github/actions/playwright-image/digests.json"), "utf8"));
    const version = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8")).packages[
      "node_modules/playwright-core"
    ].version;
    expect(digests[version], `digests.json has no entry for Playwright ${version}`).toMatch(/^sha256:[0-9a-f]{64}$/);
    const action = readFileSync(join(REPO_ROOT, ".github/actions/playwright-image/action.yml"), "utf8");
    expect(action).toContain('echo "image=$tag@$digest"');
  });
});
