// #1340: readiness must prove the preview serves THIS build. Every failure case
// below is a shape that has reached, or could reach, the edge-e2e job: a guard
// tested only on the success path proves nothing (CLAUDE.md "Verify guards
// against the failure they guard, not the success").
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKER_FILE, checkOnce, readLocalBuild, waitForPreview } from "../wait-for-preview.mjs";

const BASE = "https://edge-e2e.example.pages.dev";
const BUILD = { marker: "39999999-1", entry: "/assets/index-NEW111.js", adminChunk: "/assets/AdminApp-NEW222.js" };
const shellFor = (entry) => `<!doctype html><script type="module" crossorigin src="${entry}"></script>`;

function response(status, type, body = "") {
  return new Response(body, { status, headers: type ? { "content-type": type } : {} });
}

// A preview whose routes answer as given; anything unlisted is a 404 HTML page.
function preview(routes) {
  return vi.fn(async (url) => {
    const make = routes[new URL(url).pathname];
    return make ? make() : response(404, "text/html", "<h1>Not found</h1>");
  });
}

const healthy = {
  [`/${MARKER_FILE}`]: () => response(200, "text/plain", `${BUILD.marker}\n`),
  "/api/events/timeline": () => response(200, "application/json; charset=utf-8", "{}"),
  "/admin": () => response(200, "text/html; charset=utf-8", shellFor(BUILD.entry)),
  [BUILD.adminChunk]: () => response(200, "application/javascript"),
};

describe("checkOnce", () => {
  it("passes when this run's deployment, Functions, its shell and its admin chunk are all served", async () => {
    expect(await checkOnce(BASE, BUILD, { fetchImpl: preview(healthy) })).toEqual({ ok: true });
  });

  it("fails when Functions serve HTML (the deploy is not up yet)", async () => {
    const fetchImpl = preview({ ...healthy, "/api/events/timeline": () => response(200, "text/html", "<html>") });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timeline/);
  });

  it("fails on a PREVIOUS deployment with byte-identical hashes (a functions-only PR, or a re-run)", async () => {
    // Everything this build ships is served, under the same hashed names; only
    // the deployment marker can tell the two deployments apart.
    const fetchImpl = preview({ ...healthy, [`/${MARKER_FILE}`]: () => response(200, "text/plain", "39999998-1\n") });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/"39999998-1", not this run's 39999999-1/);
  });

  it("fails when the marker is missing: the SPA fallback's 200 text/html is not a match", async () => {
    const fetchImpl = preview({
      ...healthy,
      [`/${MARKER_FILE}`]: () => response(200, "text/html", shellFor(BUILD.entry)),
    });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/previous deployment/);
  });

  it("fails when /admin is another build's shell, though Functions answer JSON", async () => {
    const fetchImpl = preview({
      ...healthy,
      "/admin": () => response(200, "text/html", shellFor("/assets/index-OLD999.js")),
    });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not load this build's entry/);
  });

  it("fails when the admin chunk is missing (404)", async () => {
    const { [BUILD.adminChunk]: _gone, ...routes } = healthy;
    const result = await checkOnce(BASE, BUILD, { fetchImpl: preview(routes) });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/AdminApp-NEW222\.js: 404/);
  });

  it("fails when the admin chunk path answers 200 with an HTML page (SPA fallback)", async () => {
    const fetchImpl = preview({ ...healthy, [BUILD.adminChunk]: () => response(200, "text/html", "<html>") });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/text\/html/);
  });

  it("bounds each request: an edge that never answers fails the check instead of hanging", async () => {
    // Resolves only when the caller's signal aborts, like a stalled connection.
    const fetchImpl = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    );
    const result = await checkOnce(BASE, BUILD, { fetchImpl, requestTimeoutMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^request failed: .*(timeout|aborted)/i);
  });

  it("fails, rather than throws, when a request errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await checkOnce(BASE, BUILD, { fetchImpl })).toEqual({
      ok: false,
      reason: "request failed: fetch failed",
    });
  });
});

describe("waitForPreview", () => {
  const sleep = vi.fn(async () => {});

  it("needs the required number of passes RUNNING: a failure in between resets the count", async () => {
    // pass, pass, stale shell, pass, pass, pass
    const stale = [false, false, true, false, false, false];
    let call = 0;
    const fetchImpl = vi.fn(async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/admin") {
        const entry = stale[call++] ? "/assets/index-OLD999.js" : BUILD.entry;
        return response(200, "text/html", shellFor(entry));
      }
      return healthy[pathname]();
    });
    const result = await waitForPreview(BASE, BUILD, { fetchImpl, sleep, attempts: 10, required: 3 });
    expect(result).toEqual({ ok: true, attempts: 6 });
  });

  it("gives up with the last reason when the preview never serves this build", async () => {
    const fetchImpl = preview({ ...healthy, "/admin": () => response(200, "text/html", shellFor("/x/old.js")) });
    const result = await waitForPreview(BASE, BUILD, { fetchImpl, sleep, attempts: 4, required: 3 });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(4);
    expect(result.reason).toMatch(/does not load this build's entry/);
  });
});

describe("readLocalBuild", () => {
  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function dist(files) {
    dir = await mkdtemp(path.join(os.tmpdir(), "wait-for-preview-"));
    await mkdir(path.join(dir, "assets"));
    for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, name), body);
    return dir;
  }

  it("reads the hashed entry and admin chunk from a Vite build", async () => {
    const d = await dist({
      [MARKER_FILE]: "39068387682-1\n",
      "index.html": shellFor("/assets/index-BmcyTFo8.js"),
      "assets/AdminApp-mxFedEXj.js": "",
      "assets/index-BmcyTFo8.js": "",
    });
    expect(await readLocalBuild(d)).toEqual({
      marker: "39068387682-1",
      entry: "/assets/index-BmcyTFo8.js",
      adminChunk: "/assets/AdminApp-mxFedEXj.js",
    });
  });

  it("refuses a dist with no deployment marker: nothing could prove which deployment is live", async () => {
    const d = await dist({ "index.html": shellFor("/assets/index-A.js"), "assets/AdminApp-a.js": "" });
    await expect(readLocalBuild(d)).rejects.toThrow(/no deployment marker/);
  });

  it("refuses a build with no admin chunk rather than waiting on nothing", async () => {
    const d = await dist({ [MARKER_FILE]: "1-1", "index.html": shellFor("/assets/index-A.js") });
    await expect(readLocalBuild(d)).rejects.toThrow(/exactly one AdminApp/);
  });

  it("refuses an index.html with no module entry", async () => {
    const d = await dist({ [MARKER_FILE]: "1-1", "index.html": "<html></html>", "assets/AdminApp-a.js": "" });
    await expect(readLocalBuild(d)).rejects.toThrow(/no module entry/);
  });
});

// The script proves nothing unless the workflow runs it, and phase 2 must not
// run against a preview that was never ready (#1321).
describe("edge-e2e.yml wiring", () => {
  const workflow = () => readFileSync(new URL("../../.github/workflows/edge-e2e.yml", import.meta.url), "utf8");
  const step = (yaml, name) => yaml.split(/\n(?= {6}- name: )/).find((s) => s.includes(`- name: ${name}`)) ?? "";

  it("writes this run's deployment marker into dist before deploying it", () => {
    const yaml = workflow();
    const build = step(yaml, "Build frontend");
    expect(build).toContain(`echo "\${GITHUB_RUN_ID}-\${GITHUB_RUN_ATTEMPT}" > dist/${MARKER_FILE}`);
    expect(yaml.indexOf("- name: Build frontend")).toBeLessThan(yaml.indexOf("- name: Deploy preview"));
  });

  it("waits with wait-for-preview.mjs against the local dist, in a step other steps can see", () => {
    const ready = step(workflow(), "Wait for the preview to serve this run's deployment");
    expect(ready).toMatch(/\n {8}id: ready\n/);
    expect(ready).toContain('node scripts/wait-for-preview.mjs "$PREVIEW_URL" frontend/dist');
  });

  it("runs phase 2 after a phase-1 test failure, but only once readiness succeeded", () => {
    const phase2 = step(workflow(), '"E2E on the edge, phase 2: login"');
    expect(phase2).toContain("if: (success() || failure()) && steps.ready.outcome == 'success'");
  });
});
