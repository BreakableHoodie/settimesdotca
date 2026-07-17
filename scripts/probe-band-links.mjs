#!/usr/bin/env node
/**
 * Probe canonical bandcamp URL patterns for bands with no links on file.
 *
 * Searching is the expensive part of link collection; validation is cheap
 * (owner does a 2-second yes/no). This script does the searching with plain
 * HTTP — no search engine, no AI, no rate-limited APIs — and buckets results:
 *
 *   AUTO    exact band-name match on the page AND an Ontario location
 *           (safe to enter under the highest-confidence doctrine)
 *   REVIEW  a real band page exists but identity is unproven
 *           (name variant, non-Ontario or missing location) — owner validates
 *   NONE    no band page at any candidate URL
 *
 * Existence is NOT identity: bandcamp serves a signup page for unclaimed
 * subdomains, and popular names are taken by unrelated acts (our Mixed
 * Feelings lives at mixedfeelings2 because mixedfeelings was taken).
 *
 * Usage:
 *   node scripts/probe-band-links.mjs --file bands.txt     # newline-separated names
 *   node scripts/probe-band-links.mjs --names "Band A,Band B"
 *   make probe-links FILE=bands.txt
 *
 * Web-search fallback: bands unresolved by URL-guessing get one real web
 * search. Default engine is DuckDuckGo's keyless HTML endpoint (no setup);
 * setting GOOGLE_CSE_KEY + GOOGLE_CSE_ID upgrades to Google Programmable
 * Search (100 free queries/day). Search hits land in REVIEW — never AUTO;
 * a result link can't prove identity the way a bandcamp location can.
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const file = argValue("--file");
const namesArg = argValue("--names");
let names = [];
if (file) {
  names = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
} else if (namesArg) {
  names = namesArg
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
} else {
  console.error("Usage: probe-band-links.mjs --file <names.txt> | --names 'A,B,C'");
  process.exit(1);
}

/** Candidate bandcamp subdomain slugs for a band name, most-canonical first. */
function candidateSlugs(name) {
  const concat = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const noThe = name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]/g, "");
  const hyphen = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [...new Set([concat, noThe, hyphen])].filter((s) => s.length >= 3);
}

const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Fetch a bandcamp subdomain; return null for dead/signup pages. */
const THROTTLE_MS = 2000; // stay under bandcamp's rate limiter — a 429'd run misreads live pages as NONE
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(slug) {
  const url = `https://${slug}.bandcamp.com/`;
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "settimes-link-probe/1.0 (band link discovery; settimes.ca)" },
    });
  } catch {
    return null;
  }
  if (res.status === 429) return { rateLimited: true }; // NEVER read a 429 as "no page"
  if (!res.ok) return null;
  // Unclaimed subdomains redirect to bandcamp.com signup/discover.
  if (!new URL(res.url).hostname.startsWith(slug + ".")) return null;
  // Full body — the location markup sits deep in the sidebar, far past the head.
  const html = await res.text();
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").trim();
  if (/^signup\b/i.test(title)) return null;
  // Band pages title as "Music | Band Name" or "Release | Band Name".
  const pageBandName = title.includes("|") ? title.split("|").pop().trim() : title;
  // Location renders as <span class="location secondaryText">City, Region</span>;
  // fall back to any og/meta description mention of a place-like "City, Region".
  const location = (html.match(/class="location[^"]*"[^>]*>\s*([^<]+?)\s*</i)?.[1] || "").trim();
  return { url, title, pageBandName, location };
}

const ONTARIO = /ontario|,\s*on\b/i;

const CSE_KEY = process.env.GOOGLE_CSE_KEY;
const CSE_ID = process.env.GOOGLE_CSE_ID;
const cseEnabled = Boolean(CSE_KEY && CSE_ID);

const MUSIC_DOMAIN = /bandcamp\.com|instagram\.com|facebook\.com|open\.spotify\.com|linktr\.ee|youtube\.com/i;

/** Keyless DuckDuckGo HTML search; returns top result links or null. */
async function ddgSearch(name) {
  const q = `"${name}" band bandcamp OR instagram OR facebook OR spotify`;
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    if (!res.ok) {
      console.error(`ddg: HTTP ${res.status} for "${name}"`);
      return null;
    }
    const html = await res.text();
    const links = [...html.matchAll(/uddg=([^&"]+)/g)]
      .map((m) => decodeURIComponent(m[1]))
      .filter((u) => u.startsWith("http") && !u.includes("duckduckgo.com"));
    // Dedupe, prefer music-platform domains, keep it short.
    const seen = new Set();
    const unique = links.filter((u) => {
      const key = u.replace(/[?#].*$/, "").replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const ranked = [...unique.filter((u) => MUSIC_DOMAIN.test(u)), ...unique.filter((u) => !MUSIC_DOMAIN.test(u))];
    return ranked.slice(0, 5).map((link) => ({ link, title: "", snippet: "" }));
  } catch {
    return null;
  }
}

/** One real-Google query for a band; returns top result links or null. */
async function googleSearch(name) {
  const q = `"${name}" band bandcamp OR instagram OR facebook OR spotify`;
  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CSE_KEY)}` +
    `&cx=${encodeURIComponent(CSE_ID)}&num=5&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      console.error(`google: HTTP ${res.status} for "${name}"${res.status === 429 ? " (daily quota?)" : ""}`);
      return null;
    }
    const data = await res.json();
    return (data.items || []).map((i) => ({ title: i.title, link: i.link, snippet: (i.snippet || "").slice(0, 140) }));
  } catch {
    return null;
  }
}

const results = { AUTO: [], REVIEW: [], NONE: [], RETRY: [] };
for (const name of names) {
  let hit = null;
  let hitSlug = null;
  let sawRateLimit = false;
  for (const slug of candidateSlugs(name)) {
    // Sequential + polite: one candidate at a time, stop at the first live page.
    const page = await probe(slug);
    await sleep(THROTTLE_MS);
    if (page?.rateLimited) {
      sawRateLimit = true;
      console.error(`probed: ${name} → 429 on ${slug}, backing off 30s`);
      await sleep(30000);
      continue;
    }
    if (page) {
      hit = page;
      hitSlug = slug;
      break;
    }
  }
  if (!hit) {
    if (sawRateLimit) {
      results.RETRY.push({ name });
      continue;
    }
    const engine = cseEnabled ? "Google" : "DuckDuckGo";
    const hits = cseEnabled ? await googleSearch(name) : await ddgSearch(name);
    await sleep(THROTTLE_MS);
    if (hits?.length) {
      results.REVIEW.push({ name, google: hits, engine });
      console.error(`probed: ${name} → REVIEW via ${engine} (${hits.length} hits)`);
      continue;
    }
    results.NONE.push({ name });
    continue;
  }
  const nameMatches = normalize(hit.pageBandName) === normalize(name);
  const inOntario = ONTARIO.test(hit.location);
  const bucket = nameMatches && inOntario ? "AUTO" : "REVIEW";
  results[bucket].push({
    name,
    url: hit.url,
    page_band_name: hit.pageBandName,
    location: hit.location || "(none shown)",
    slug: hitSlug,
  });
  console.error(`probed: ${name} → ${bucket} (${hit.url})`);
}

console.log("\n## AUTO — exact name match + Ontario location (doctrine-safe to enter)\n");
for (const r of results.AUTO) console.log(`- **${r.name}** → ${r.url} · "${r.page_band_name}" · ${r.location}`);
if (!results.AUTO.length) console.log("(none)");

console.log("\n## REVIEW — page exists, identity unproven (owner yes/no)\n");
for (const r of results.REVIEW) {
  if (r.google) {
    console.log(`- **${r.name}** — ${r.engine} hits:`);
    for (const g of r.google) console.log(`    - ${g.link}${g.title ? " — " + g.title : ""}`);
  } else {
    console.log(`- **${r.name}** → ${r.url} · page says "${r.page_band_name}" · ${r.location}`);
  }
}
if (!results.REVIEW.length) console.log("(none)");

console.log(`\n## NONE — no live band page at candidate URLs and no web-search hits\n`);
for (const r of results.NONE) console.log(`- ${r.name}`);
if (!results.NONE.length) console.log("(none)");

console.log("\n## RETRY — rate-limited mid-probe; result unknown, re-run later\n");
for (const r of results.RETRY) console.log(`- ${r.name}`);
if (!results.RETRY.length) console.log("(none)");
