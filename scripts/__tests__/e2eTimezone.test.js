// #1256: the E2E suite must run on the app's clock.
//
// The app decides "today" in America/Toronto (functions/utils/eventDay.js).
// Specs date their fixtures with the test runner's clock. On a UTC CI runner
// those disagreed from 8 PM to midnight Toronto time: "today" fixtures landed
// in the timeline's UPCOMING bucket, filled its LIMIT 10, and
// public-timeline.spec.js failed on every branch for four hours a night.
//
// Three properties keep that closed, each checked here from source:
// 1. playwright.config.js FORCES the runner's TZ to the app's zone (a default
//    would keep CI's UTC) and pins the browser with use.timezoneId.
// 2. That zone is the one the app actually uses, so the two cannot drift.
// 3. No spec computes a calendar date in UTC (toISOString().slice(0, 10) and
//    friends), which would ignore the pinned zone entirely.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(__dirname, "..", "..");
const config = readFileSync(join(repo, "playwright.config.js"), "utf8");
const eventDay = readFileSync(join(repo, "functions/utils/eventDay.js"), "utf8");

const UTC_DATE_IDIOM =
  /toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*["'`]T["'`]\s*\))/;

describe("E2E clock matches the app clock (#1256)", () => {
  it("the app's zone is America/Toronto (the value the config must match)", () => {
    expect(eventDay).toMatch(/timeZone:\s*"America\/Toronto"/);
  });

  it("playwright.config.js forces the runner TZ to the app zone", () => {
    expect(config).toMatch(/process\.env\.TZ\s*=\s*['"]America\/Toronto['"]/);
    // A defaulting assignment would leave a UTC runner on UTC.
    expect(config).not.toMatch(/process\.env\.TZ\s*\?\?=/);
  });

  it("playwright.config.js pins the browser timezone in the shared use block", () => {
    expect(config).toMatch(/APP_TIMEZONE\s*=\s*['"]America\/Toronto['"]/);
    expect(config).toMatch(/timezoneId:\s*APP_TIMEZONE/);
  });

  it("no e2e spec computes a calendar date in UTC", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "node_modules" && !name.endsWith("-snapshots")) walk(p);
        } else if (/\.(m?js|ts)$/.test(name)) {
          // The WHOLE file, not line by line: a chain split across lines
          // (`.toISOString()` then `.slice(0, 10)` on the next) evaded a
          // per-line scan. \s in the pattern already spans newlines.
          const source = readFileSync(p, "utf8");
          for (const match of source.matchAll(new RegExp(UTC_DATE_IDIOM, "g"))) {
            const lineStart = source.lastIndexOf("\n", match.index) + 1;
            const line = source.slice(lineStart).split("\n")[0];
            if (line.trim().startsWith("//")) continue;
            const lineNo = source.slice(0, match.index).split("\n").length;
            offenders.push(`${relative(repo, p)}:${lineNo}: ${match[0].replace(/\s+/g, " ")}`);
          }
        }
      }
    };
    walk(join(repo, "e2e"));
    expect(offenders).toEqual([]);
  });

  // The scan above passes vacuously if its pattern stops matching the shapes
  // it hunts. Prove it still recognises each one, and not the safe form.
  it("the UTC-idiom detector still recognises what it hunts", () => {
    expect(UTC_DATE_IDIOM.test("return d.toISOString().slice(0, 10);")).toBe(true);
    expect(UTC_DATE_IDIOM.test("new Date().toISOString().split('T')[0]")).toBe(true);
    expect(UTC_DATE_IDIOM.test("x.toISOString().substring(0,10)")).toBe(true);
    expect(UTC_DATE_IDIOM.test("d\n  .toISOString()\n  .slice(0, 10)")).toBe(true);
    expect(UTC_DATE_IDIOM.test('d.toLocaleDateString("en-CA")')).toBe(false);
  });
});
