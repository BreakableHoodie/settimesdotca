import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CACHE_BROWSE, CACHE_SHOW_CRITICAL } from "../cacheHeaders.js";

/**
 * Source-scanning guard, not a behavioural test — the failure it prevents is a
 * copy-pasted string, which no request-level assertion can see.
 *
 * `cacheHeaders.js` documents two tiers, but `CACHE_BROWSE` was exported and
 * never imported by anything while five endpoints hardcoded its exact value.
 * With the constant bypassed, `api/bands/[name].js` drifted to the browse TTL
 * even though it projects live per-performance state, so a cancelled set could
 * read as playing for up to five minutes — the precise failure the two-tier
 * split exists to prevent.
 *
 * Both halves below are needed. The first stops the literal from coming back;
 * the second catches a route that carries live state and picked the wrong tier
 * via the constant (which the literal scan cannot see).
 */

const API_ROOT = join(import.meta.dirname, "../../api");

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectJsFiles(full));
    } else if (entry.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const apiFiles = collectJsFiles(API_ROOT).map((path) => ({
  path,
  rel: path.slice(path.indexOf("functions/")),
  source: readFileSync(path, "utf-8"),
}));

// Both tiers state a max-age; a route hardcoding either value has bypassed the
// module. Derived from the constants so bumping a TTL cannot silently un-guard.
const TIER_MAX_AGES = [CACHE_BROWSE, CACHE_SHOW_CRITICAL].map((value) => value.match(/max-age=(\d+)/)[1]);

describe("cache tier constants are the single source of truth", () => {
  it("exports two distinct tiers with show-critical the shorter one", () => {
    const browse = Number(CACHE_BROWSE.match(/max-age=(\d+)/)[1]);
    const showCritical = Number(CACHE_SHOW_CRITICAL.match(/max-age=(\d+)/)[1]);
    expect(showCritical).toBeLessThan(browse);
  });

  it("both tiers are imported by at least one route", () => {
    for (const constant of ["CACHE_BROWSE", "CACHE_SHOW_CRITICAL"]) {
      const importers = apiFiles.filter((f) => f.source.includes(constant));
      expect(importers.length, `${constant} is exported but no route imports it`).toBeGreaterThan(0);
    }
  });

  it("no API route hardcodes a max-age that a tier constant already names", () => {
    const offenders = [];
    for (const file of apiFiles) {
      for (const age of TIER_MAX_AGES) {
        // Only Cache-Control values, so an unrelated `max-age` (HSTS) is ignored.
        if (new RegExp(`"Cache-Control":\\s*\`?"?public,\\s*max-age=${age}`).test(file.source)) {
          offenders.push(`${file.rel} hardcodes max-age=${age}`);
        }
      }
    }
    expect(offenders, `use the cacheHeaders.js constant instead:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("routes projecting live per-performance state use the show-critical tier", () => {
    // A route selecting a cancellation flag or a set time is show-critical by
    // the module's own rule, whatever the route is named.
    const LIVE_STATE_COLUMNS = /\bp\.is_cancelled\b|\bp\.start_time\b|\bp\.end_time\b/;

    // Exempt by design, named rather than pattern-matched so adding one is a
    // deliberate edit:
    //   schedule.js  — env-tunable TTL that already DEFAULTS to 60s, i.e. the
    //                  show-critical value; the knob is the point.
    //   ical.js      — a calendar feed, not a page fetch. Subscribers poll on
    //                  their client's own schedule (15 min to 24 h) and cache
    //                  independently, so this TTL does not govern what a fan
    //                  sees. Cancellations travel as RFC 5545 STATUS:CANCELLED.
    //   recap.js     — gated by concludedEventSql(), so it can only ever serve
    //                  an event that has already ended. Nothing it returns can
    //                  change while a show is running; that is the whole test.
    const EXEMPT = new Set([
      "functions/api/schedule.js",
      "functions/api/feeds/ical.js",
      "functions/api/events/[id]/recap.js",
    ]);

    const offenders = apiFiles
      .filter((f) => LIVE_STATE_COLUMNS.test(f.source))
      .filter((f) => f.source.includes("Cache-Control"))
      .filter((f) => !f.source.includes("CACHE_SHOW_CRITICAL"))
      .map((f) => f.rel)
      .filter((rel) => !EXEMPT.has(rel));

    expect(
      offenders,
      `these project live performance state but are not on CACHE_SHOW_CRITICAL:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
