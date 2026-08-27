// Guard: functions/ has exactly ONE cookie parser.
//
// It had four, and they disagreed. `cookies.js` (parseCookies), `csrf.js` (a private
// copy), `trustedDevice.js` (an inline loop) and `auth.js` (lucia's readSessionCookie).
// Only the last trimmed the cookie NAME and joined the value on "=", so:
//
//   Cookie: __Host-session_token =abc
//     getCookie(...)                 -> undefined   (keyed on "__Host-session_token ")
//     lucia.readSessionCookie(...)   -> "abc"
//
// Two parsers disagreeing about whether a session cookie is PRESENT is how a credential
// slips past a presence check -- and the #744 dual-auth rejection is exactly such a
// check. The same `const [name, value] = split("=")` also truncated any value
// containing "=", which is every base64 value with padding.
//
// The fix was to delete three of them, not to correct three of them: four correct
// parsers can still drift apart, and being right while the others were wrong is
// precisely what let this go unnoticed. This test keeps that at one.
//
// SCOPE: matches the header-splitting idiom, so a parser written a genuinely different
// way could evade it. It catches the copy-paste that actually happened.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANONICAL = "utils/cookies.js";

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" || entry === "node_modules" ? [] : sourceFiles(full);
    }
    return entry.endsWith(".js") ? [full] : [];
  });
}

describe("cookie parsing has a single home", () => {
  const files = sourceFiles(FUNCTIONS_DIR);

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('only cookies.js splits a Cookie header on ";"', () => {
    const offenders = files
      .filter((file) => /\bsplit\(["']\s*;\s*["']\)/.test(readFileSync(file, "utf8")))
      .map((file) => relative(FUNCTIONS_DIR, file))
      .filter((rel) => rel !== CANONICAL);

    expect(
      offenders,
      `These files parse a Cookie header themselves. functions/${CANONICAL} is the only ` +
        "cookie parser: import parseCookies or getCookie from it. Four copies disagreed " +
        "about whether `__Host-session_token =v` was present, which is a credential " +
        "slipping past a presence check.",
    ).toEqual([]);
  });

  it("nothing re-declares a local parseCookies", () => {
    const offenders = files
      .filter((file) => /(function|const)\s+parseCookies\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(FUNCTIONS_DIR, file))
      .filter((rel) => rel !== CANONICAL);

    expect(offenders, `parseCookies is declared in functions/${CANONICAL} only; import it.`).toEqual([]);
  });

  it("the canonical parser handles every shape the copies got wrong", async () => {
    const { parseCookies } = await import("../cookies.js");

    // Name carrying whitespace -- invisible to three of the four copies.
    expect(parseCookies("__Host-session_token =abc")["__Host-session_token"]).toBe("abc");
    // Value containing "=" -- truncated to "YWJj" by three of the four.
    expect(parseCookies("csrf_token=YWJj==").csrf_token).toBe("YWJj==");
    // Malformed percent-escape -- decodeURIComponent THROWS on this, turning a
    // client-controlled header into a 500. Must degrade to the raw value instead.
    expect(() => parseCookies("session_token=abc%")).not.toThrow();
    expect(parseCookies("session_token=abc%").session_token).toBe("abc%");
    // A valid escape still decodes.
    expect(parseCookies("t=100%25").t).toBe("100%");
  });
});
