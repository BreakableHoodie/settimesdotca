// #1340: readiness must prove the preview serves THIS build. Every failure case
// below is a shape that has reached, or could reach, the edge-e2e job: a guard
// tested only on the success path proves nothing (CLAUDE.md "Verify guards
// against the failure they guard, not the success").
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOnce, readLocalBuild, waitForPreview } from "../wait-for-preview.mjs";

const BASE = "https://edge-e2e.example.pages.dev";
const BUILD = { entry: "/assets/index-NEW111.js", adminChunk: "/assets/AdminApp-NEW222.js" };
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
  "/api/events/timeline": () => response(200, "application/json; charset=utf-8", "{}"),
  "/admin": () => response(200, "text/html; charset=utf-8", shellFor(BUILD.entry)),
  [BUILD.adminChunk]: () => response(200, "application/javascript"),
};

describe("checkOnce", () => {
  it("passes when Functions, this build's shell and its admin chunk are all served", async () => {
    expect(await checkOnce(BASE, BUILD, { fetchImpl: preview(healthy) })).toEqual({ ok: true });
  });

  it("fails when Functions serve HTML (the deploy is not up yet)", async () => {
    const fetchImpl = preview({ ...healthy, "/api/events/timeline": () => response(200, "text/html", "<html>") });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timeline/);
  });

  it("fails when /admin is a PREVIOUS deployment's shell, though Functions answer JSON", async () => {
    const fetchImpl = preview({
      ...healthy,
      "/admin": () => response(200, "text/html", shellFor("/assets/index-OLD999.js")),
    });
    const result = await checkOnce(BASE, BUILD, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/previous deployment/);
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
    expect(result.reason).toMatch(/previous deployment/);
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
      "index.html": shellFor("/assets/index-BmcyTFo8.js"),
      "assets/AdminApp-mxFedEXj.js": "",
      "assets/index-BmcyTFo8.js": "",
    });
    expect(await readLocalBuild(d)).toEqual({
      entry: "/assets/index-BmcyTFo8.js",
      adminChunk: "/assets/AdminApp-mxFedEXj.js",
    });
  });

  it("refuses a build with no admin chunk rather than waiting on nothing", async () => {
    const d = await dist({ "index.html": shellFor("/assets/index-A.js") });
    await expect(readLocalBuild(d)).rejects.toThrow(/exactly one AdminApp/);
  });

  it("refuses an index.html with no module entry", async () => {
    const d = await dist({ "index.html": "<html></html>", "assets/AdminApp-a.js": "" });
    await expect(readLocalBuild(d)).rejects.toThrow(/no module entry/);
  });
});

// The script proves nothing unless the workflow runs it, and phase 2 must not
// run against a preview that was never ready (#1321).
describe("edge-e2e.yml wiring", () => {
  const workflow = () => readFileSync(new URL("../../.github/workflows/edge-e2e.yml", import.meta.url), "utf8");
  const step = (yaml, name) => yaml.split(/\n(?= {6}- name: )/).find((s) => s.includes(`- name: ${name}`)) ?? "";

  it("waits with wait-for-preview.mjs against the local dist, in a step other steps can see", () => {
    const ready = step(workflow(), "Wait for the preview to serve this build");
    expect(ready).toMatch(/\n {8}id: ready\n/);
    expect(ready).toContain('node scripts/wait-for-preview.mjs "$PREVIEW_URL" frontend/dist');
  });

  it("runs phase 2 after a phase-1 test failure, but only once readiness succeeded", () => {
    const phase2 = step(workflow(), '"E2E on the edge, phase 2: login"');
    expect(phase2).toContain("if: (success() || failure()) && steps.ready.outcome == 'success'");
  });
});
