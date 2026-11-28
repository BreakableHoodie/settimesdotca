#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRANSIENT_STATUSES = new Set([403, 408, 425, 429, 500, 502, 504]);
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 6000;

function pass() {
  return { ok: true };
}

function fail(reason) {
  return { ok: false, reason };
}

export function checkIcal(body, status = 200) {
  if (status !== 200) return fail(`expected HTTP 200, got ${status}`);
  if (!body.startsWith("BEGIN:VCALENDAR")) return fail("missing BEGIN:VCALENDAR");
  if (!/END:VCALENDAR\r?\n?$/.test(body)) return fail("missing END:VCALENDAR");
  if (!/BEGIN:VTIMEZONE[\s\S]*?TZID:America\/Toronto[\s\S]*?END:VTIMEZONE/.test(body)) {
    return fail("missing America/Toronto VTIMEZONE");
  }

  const stack = [];
  for (const line of body.split(/\r?\n/)) {
    const begin = line.match(/^BEGIN:([A-Z0-9-]+)$/);
    if (begin) {
      stack.push(begin[1]);
      continue;
    }
    const end = line.match(/^END:([A-Z0-9-]+)$/);
    if (end) {
      if (stack.pop() !== end[1]) return fail(`unbalanced ${end[1]} block`);
    }
    const dtstart = line.match(/^DTSTART([^:]*):(.+)$/);
    if (dtstart && !stack.includes("VTIMEZONE") && !/(?:^|;)TZID=America\/Toronto(?:;|$)/.test(dtstart[1])) {
      return fail("DTSTART is not bound to America/Toronto");
    }
  }
  if (stack.length > 0) return fail(`unclosed ${stack.at(-1)} block`);
  return pass();
}

// The per-artist subscription feed: same calendar rules as the main feed, so
// reuse checkIcal, and also require the content type a calendar app keys on.
export function checkBandIcal(body, status = 200, contentType = "") {
  if (status === 200 && !/^text\/calendar\s*(;|$)/i.test(contentType)) {
    return fail(`expected Content-Type text/calendar, got ${contentType || "none"}`);
  }
  return checkIcal(body, status);
}

// A non-numeric ?band= must be refused, not answered with a calendar or a 5xx.
export function checkInvalidBandRefused(_body, status) {
  return status === 400 ? pass() : fail(`expected HTTP 400, got ${status}`);
}

// Fan email is retired; the old emailed URLs stay alive as a static 410 page.
export const RETIRED_PATHS = [
  "/api/bands/x/unfollow",
  "/api/bands/x/confirm-follow",
  "/api/bands/confirm-follow-batch",
  "/api/subscriptions/unsubscribe",
  "/api/subscriptions/verify",
  "/subscribe",
];

export function checkRetired(_body, status) {
  return status === 410 ? pass() : fail(`expected HTTP 410, got ${status}`);
}

// An /api path no handler owns must be a JSON 404, not the SPA shell with 200 (#1491).
export function checkUnknownApiNotFound(body, status) {
  if (status !== 404) return fail(`expected HTTP 404, got ${status}`);
  try {
    return JSON.parse(body)?.code === "NOT_FOUND" ? pass() : fail("404 body is not the NOT_FOUND JSON error");
  } catch {
    return fail("404 body is not JSON");
  }
}

export function extractSitemapUrls(body) {
  return [...body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1]);
}

export function checkSitemap(body, status = 200) {
  if (status !== 200) return fail(`expected HTTP 200, got ${status}`);
  if (!/<urlset\b[^>]*>/i.test(body) || !/<\/urlset>/i.test(body)) {
    return fail("missing urlset element");
  }
  const urls = extractSitemapUrls(body);
  if (urls.length < 20) return fail(`expected at least 20 loc entries, got ${urls.length}`);
  if (urls.some((url) => !/^https:\/\/settimes\.ca\//.test(url))) {
    return fail("sitemap contains a non-canonical absolute URL");
  }
  return pass();
}

function countMatches(body, pattern) {
  return body.match(pattern)?.length ?? 0;
}

export function checkSsrIdentity(body, homepageTitle, status = 200) {
  if (status !== 200) return fail(`expected HTTP 200, got ${status}`);
  if (countMatches(body, /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) !== 1) {
    return fail("expected exactly one canonical link");
  }
  if (countMatches(body, /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/gi) !== 1) {
    return fail("expected exactly one og:title");
  }
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) return fail("missing title");
  if (decodeHtmlEntities(title) === decodeHtmlEntities(homepageTitle)) {
    return fail("title is the homepage default");
  }
  return pass();
}

function decodeHtmlEntities(value) {
  // &amp; last: decoding it first turns "&amp;lt;" into "<" (double unescape).
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export async function readHomepageTitle() {
  const indexPath = new URL("../frontend/index.html", import.meta.url);
  const html = await readFile(indexPath, "utf8");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) throw new Error(`Could not read homepage <title> from ${indexPath.pathname}`);
  return title;
}

export async function retryFetch(
  url,
  { fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url);
      if (!TRANSIENT_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) throw error;
    }
    await sleep(RETRY_DELAY_MS);
  }
  throw lastError ?? new Error("fetch failed");
}

async function fetchChecked(url, checker, options) {
  try {
    const response = await retryFetch(url, options);
    return checker(await response.text(), response.status);
  } catch (error) {
    return fail(`fetch failed after ${MAX_ATTEMPTS} attempts: ${error.message}`);
  }
}

export async function runProbes(baseUrl, options = {}) {
  const base = new URL(baseUrl);
  base.pathname = base.pathname.replace(/\/$/, "");
  const results = [];

  results.push(["iCal", await fetchChecked(new URL("/api/feeds/ical", base), checkIcal, options)]);

  let sitemapBody;
  let sitemapStatus;
  try {
    const response = await retryFetch(new URL("/sitemap.xml", base), options);
    sitemapStatus = response.status;
    sitemapBody = await response.text();
    results.push(["sitemap", checkSitemap(sitemapBody, sitemapStatus)]);
  } catch (error) {
    results.push(["sitemap", fail(`fetch failed after ${MAX_ATTEMPTS} attempts: ${error.message}`)]);
  }

  // Per-artist iCal: pick a band id from the sitemap at probe time (it lists
  // only bands with a public, revealed set), never a hard-coded id.
  const sitemapBandId = (sitemapBody ? extractSitemapUrls(sitemapBody) : [])
    .map((url) => url.match(/^https:\/\/settimes\.ca\/band\/(\d+)$/)?.[1])
    .find(Boolean);
  if (!sitemapBandId) {
    results.push(["per-artist iCal", fail("sitemap has no band URL to derive a band id from")]);
  } else {
    try {
      const response = await retryFetch(new URL(`/api/feeds/ical?band=${sitemapBandId}`, base), options);
      results.push([
        "per-artist iCal",
        checkBandIcal(await response.text(), response.status, response.headers.get("content-type") ?? ""),
      ]);
    } catch (error) {
      results.push(["per-artist iCal", fail(`fetch failed after ${MAX_ATTEMPTS} attempts: ${error.message}`)]);
    }
  }
  results.push([
    "per-artist iCal rejects invalid band",
    await fetchChecked(new URL("/api/feeds/ical?band=abc", base), checkInvalidBandRefused, options),
  ]);

  results.push([
    "unknown /api path is a JSON 404",
    await fetchChecked(new URL("/api/zzz-nope", base), checkUnknownApiNotFound, options),
  ]);

  for (const retiredPath of RETIRED_PATHS) {
    results.push([
      `retired ${retiredPath} is 410`,
      await fetchChecked(new URL(retiredPath, base), checkRetired, options),
    ]);
  }

  let homepageTitle;
  let homepageTitleError;
  try {
    homepageTitle = await readHomepageTitle();
  } catch (error) {
    homepageTitleError = error.message;
  }

  if (homepageTitleError) {
    results.push(["SSR identity meta", fail(homepageTitleError)]);
  } else if (sitemapStatus !== 200 || !sitemapBody) {
    results.push(["SSR identity meta", fail("cannot probe SSR pages because sitemap fetch failed")]);
  } else {
    const urls = extractSitemapUrls(sitemapBody);
    const eventUrl = urls.find((url) => /^https:\/\/settimes\.ca\/event\/[^/]+$/.test(url));
    const bandUrl = urls.find((url) => /^https:\/\/settimes\.ca\/band\/[^/]+$/.test(url));
    if (!eventUrl || !bandUrl) {
      results.push(["SSR identity meta", fail("sitemap has no event and band URLs to probe")]);
    } else {
      const pages = await Promise.all(
        [eventUrl, bandUrl].map(async (canonicalUrl) => {
          const pageUrl = new URL(canonicalUrl);
          pageUrl.host = base.host;
          pageUrl.protocol = base.protocol;
          return fetchChecked(pageUrl, (body, status) => checkSsrIdentity(body, homepageTitle, status), options);
        }),
      );
      results.push(["SSR identity meta", pages.find((result) => !result.ok) ?? pass()]);
    }
  }

  return results;
}

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("Usage: node scripts/smoke-probes.mjs <baseUrl>");
    process.exitCode = 2;
    return;
  }
  const results = await runProbes(baseUrl);
  for (const [name, result] of results) {
    console.log(`${result.ok ? "ok" : "FAIL"} ${name}${result.reason ? `: ${result.reason}` : ""}`);
  }
  if (results.some(([, result]) => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(`FAIL probes: ${error.message}`);
    process.exitCode = 1;
  }
}
