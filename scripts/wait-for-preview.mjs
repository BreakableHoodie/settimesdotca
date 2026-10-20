#!/usr/bin/env node
// Waits until a Pages preview alias serves THIS RUN'S deployment (#1340).
//
// Functions answering is not enough. The edge-e2e branch alias has served the
// previous run's (deleted) deployment while Functions already answered JSON,
// and on run 39068387682 /admin rendered the admin error boundary instead of
// the login form. So "ready" means, the required number of times running:
//   1. the alias serves this run's deployment marker (MARKER_FILE, written
//      into dist by the workflow before deploying: run id + attempt);
//   2. a Functions route answers JSON;
//   3. /admin's HTML loads the same hashed entry script as the local dist;
//   4. the local dist's hashed AdminApp chunk is served as JavaScript.
// Only 1 identifies the DEPLOYMENT. Vite hashes come from frontend source, so
// a functions-only PR, or a re-run of a commit, builds byte-identical names
// and a previous deployment passes 3 and 4. A Pages deployment publishes its
// static files and Functions together, so the marker also vouches for 2.
// A missing file is not a 404 on Pages: the SPA fallback answers 200
// text/html, which is why 1 compares content and 4 checks content-type.
//
// Usage: node scripts/wait-for-preview.mjs <previewUrl> [distDir]

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FUNCTIONS_PATH = "/api/events/timeline";
export const MARKER_FILE = "edge-e2e-deployment.txt";
// Per request, as the curl loop this replaced had (--max-time 10): undici would
// otherwise wait ~300 s for headers, and a stalled edge would end the job on
// its own timeout instead of this script's ::error:: reason.
const REQUEST_TIMEOUT_MS = 10_000;

function pass() {
  return { ok: true };
}

function fail(reason) {
  return { ok: false, reason };
}

// This run's deployment marker, plus the entry script and admin chunk the tests
// will need, from the local build.
export async function readLocalBuild(distDir) {
  const marker = (await readFile(path.join(distDir, MARKER_FILE), "utf8").catch(() => "")).trim();
  if (!marker) throw new Error(`no deployment marker at ${path.join(distDir, MARKER_FILE)}`);
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const entry = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="(\/assets\/[^"]+\.js)"/)?.[1];
  if (!entry) throw new Error(`no module entry script in ${path.join(distDir, "index.html")}`);
  const chunks = (await readdir(path.join(distDir, "assets"))).filter((name) => /^AdminApp-[\w-]+\.js$/.test(name));
  if (chunks.length !== 1) {
    throw new Error(`expected exactly one AdminApp-*.js in ${distDir}/assets, found ${chunks.length}`);
  }
  return { marker, entry, adminChunk: `/assets/${chunks[0]}` };
}

const contentType = (response) => response.headers.get("content-type") || "";

export async function checkOnce(
  baseUrl,
  build,
  { fetchImpl = globalThis.fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  const get = (pathname) =>
    fetchImpl(new URL(pathname, baseUrl), { redirect: "manual", signal: AbortSignal.timeout(requestTimeoutMs) });
  try {
    const marker = await get(`/${MARKER_FILE}`);
    const served = marker.status === 200 ? (await marker.text()).trim() : "";
    if (served !== build.marker) {
      const seen = marker.status !== 200 ? `HTTP ${marker.status}` : JSON.stringify(served.slice(0, 40));
      return fail(`/${MARKER_FILE} is ${seen}, not this run's ${build.marker} (a previous deployment?)`);
    }

    const functions = await get(FUNCTIONS_PATH);
    if (functions.status !== 200 || !contentType(functions).startsWith("application/json")) {
      return fail(`${FUNCTIONS_PATH}: ${functions.status} ${contentType(functions) || "no content-type"}`);
    }

    const shell = await get("/admin");
    if (shell.status !== 200 || !contentType(shell).startsWith("text/html")) {
      return fail(`/admin: ${shell.status} ${contentType(shell) || "no content-type"}`);
    }
    if (!(await shell.text()).includes(`src="${build.entry}"`)) {
      return fail(`/admin does not load this build's entry ${build.entry}`);
    }

    const chunk = await get(build.adminChunk);
    if (chunk.status !== 200 || !/javascript/.test(contentType(chunk))) {
      return fail(`${build.adminChunk}: ${chunk.status} ${contentType(chunk) || "no content-type"}`);
    }
    return pass();
  } catch (error) {
    return fail(`request failed: ${error?.message || error}`);
  }
}

export async function waitForPreview(
  baseUrl,
  build,
  {
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 40,
    intervalMs = 5000,
    required = 3,
    log = () => {},
  } = {},
) {
  let streak = 0;
  let last = fail("not checked");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await checkOnce(baseUrl, build, { fetchImpl });
    streak = last.ok ? streak + 1 : 0;
    if (streak >= required) return { ok: true, attempts: attempt };
    log(`Waiting for the preview to serve this build (${attempt}/${attempts}): ${last.ok ? "ok" : last.reason}`);
    if (attempt < attempts) await sleep(intervalMs);
  }
  return { ok: false, attempts, reason: last.reason ?? `passed fewer than ${required} times running` };
}

async function main() {
  const [baseUrl, distDir = "frontend/dist"] = process.argv.slice(2);
  if (!baseUrl) {
    console.error("Usage: node scripts/wait-for-preview.mjs <previewUrl> [distDir]");
    process.exitCode = 2;
    return;
  }
  const build = await readLocalBuild(distDir);
  console.log(`Expecting deployment ${build.marker}, entry ${build.entry}, chunk ${build.adminChunk} at ${baseUrl}`);
  const result = await waitForPreview(baseUrl, build, { log: (line) => console.log(line) });
  if (result.ok) {
    console.log(`Preview serves this run's deployment: ${baseUrl}`);
    return;
  }
  console.error(`::error::Preview did not serve this build within ${result.attempts} checks: ${result.reason}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
