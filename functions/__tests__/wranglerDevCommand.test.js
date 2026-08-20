import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Lighthouse gate retries itself when wrangler vanishes mid-run (#891, for
 * the upstream abort in #878 / cloudflare/workers-sdk#14926). To retry it has to
 * restart the dev server, which means the start command now lives in TWO places:
 *
 *   .github/actions/e2e-env/action.yml   starts it for the job
 *   .github/workflows/quality.yml        restarts it for the retry
 *
 * A single shared script would be tidier, but the action is on the critical path
 * of every E2E job and refactoring it to serve one retry is a poor trade. Two
 * copies plus this guard is the cheaper arrangement -- provided the copies cannot
 * silently diverge, which is what this test exists to prevent.
 *
 * The failure it guards against is quiet rather than loud: if the port or the
 * dist path drifted in one file only, the retry would still "work", just against
 * a different server than the run it is retrying -- and report a score for the
 * wrong thing. Drift fails closed only if something checks.
 */

// fileURLToPath rather than import.meta.dirname, matching the sibling guards
// (opencodeInstructions.test.js, staticPageMeta.test.js). import.meta.dirname
// needs Node 20.11+, and this repo supports Node 20.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const readRepoFile = (relativePath) => readFileSync(join(repoRoot, relativePath), "utf8");

// Captures the arguments only, stopping at the redirect: the two call sites
// deliberately log to different files (wrangler.log vs wrangler-retry.log) so the
// retry cannot clobber the evidence of the abort that triggered it.
const WRANGLER_INVOCATION = /\.\/frontend\/node_modules\/\.bin\/wrangler pages dev ([^>]+)>/g;

const invocationsIn = (source) =>
  [...source.matchAll(WRANGLER_INVOCATION)].map(([, args]) => args.trim().replace(/\s+/g, " "));

describe("wrangler dev invocation stays identical across its two call sites", () => {
  const actionInvocations = invocationsIn(readRepoFile(".github/actions/e2e-env/action.yml"));
  const workflowInvocations = invocationsIn(readRepoFile(".github/workflows/quality.yml"));

  it("finds the invocation in the e2e-env action", () => {
    // Guards the guard: a rename or refactor that moved the command would
    // otherwise leave this whole file comparing two empty lists and passing.
    expect(actionInvocations.length).toBeGreaterThan(0);
  });

  it("finds the invocation in the Lighthouse retry", () => {
    expect(workflowInvocations.length).toBeGreaterThan(0);
  });

  it("uses the same arguments in both", () => {
    const unique = new Set([...actionInvocations, ...workflowInvocations]);
    expect([...unique]).toHaveLength(1);
  });

  it("still pins the port the gate and the probes agree on", () => {
    // 8788 is hard-coded in lighthouserc.json's url, in the liveness probes, and
    // in the readiness curl. A port change here alone would make the retry serve
    // on one port while Lighthouse measured another.
    for (const invocation of [...actionInvocations, ...workflowInvocations]) {
      expect(invocation).toContain("--port 8788");
    }
  });
});
