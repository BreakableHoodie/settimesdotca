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
  if (!res.ok) return null;
  // Unclaimed subdomains redirect to bandcamp.com signup/discover.
  if (!new URL(res.url).hostname.startsWith(slug + ".")) return null;
  const html = (await res.text()).slice(0, 120000);
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").trim();
  if (/^signup\b/i.test(title)) return null;
  // Band pages title as "Music | Band Name" or "Release | Band Name".
  const pageBandName = title.includes("|") ? title.split("|").pop().trim() : title;
  // Location renders as <span class="location secondaryText">City, Region</span>
  const location = (html.match(/class="location[^"]*"[^>]*>([^<]*)</i)?.[1] || "").trim();
  return { url, title, pageBandName, location };
}

const ONTARIO = /ontario|,\s*on\b/i;

const results = { AUTO: [], REVIEW: [], NONE: [] };
for (const name of names) {
  let hit = null;
  let hitSlug = null;
  for (const slug of candidateSlugs(name)) {
    // Sequential + polite: one candidate at a time, stop at the first live page.
    const page = await probe(slug);
    if (page) {
      hit = page;
      hitSlug = slug;
      break;
    }
  }
  if (!hit) {
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
for (const r of results.REVIEW)
  console.log(`- **${r.name}** → ${r.url} · page says "${r.page_band_name}" · ${r.location}`);
if (!results.REVIEW.length) console.log("(none)");

console.log("\n## NONE — no candidate URL is a live band page\n");
for (const r of results.NONE) console.log(`- ${r.name}`);
if (!results.NONE.length) console.log("(none)");
