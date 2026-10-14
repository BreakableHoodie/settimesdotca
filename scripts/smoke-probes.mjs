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
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
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
