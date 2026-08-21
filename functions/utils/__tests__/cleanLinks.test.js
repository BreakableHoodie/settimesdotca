import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHttpUrl, sanitizeBandSocialLinks } from "../validation.js";
// Imported from the module, not the facade: these describe HOW the doctrine is
// implemented and are not part of the public surface 43 files consume. Adding
// them to the facade would widen that surface — and correctly fail the guard in
// validationPublicSurface.test.js.
import { TRACKING_PARAMS, TRACKING_PARAM_PREFIXES } from "../validation/urls.js";

/**
 * AGENTS.md, under "Data doctrines (owner-set, non-negotiable)":
 *
 *   Clean links: strip tracking params (si, dlsi, nd, utm_*, from=) before
 *   storing any URL.
 *
 * The doctrine was written down and not implemented — `?si=` survived on every
 * stored URL, which is what Spotify's and YouTube's own share buttons append,
 * so it failed on the DEFAULT paste rather than an edge case (#928).
 *
 * The first test reads the param list out of AGENTS.md itself. A test that
 * hardcoded the same five names would pass while silently diverging from the
 * doctrine it claims to enforce — the doctrine is the spec, so it is the
 * fixture.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("clean-links doctrine is implemented, not just documented", () => {
  it("strips exactly the params AGENTS.md names", () => {
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf-8");
    const line = agents.split("\n").find((l) => l.includes("strip tracking params"));
    expect(line, "AGENTS.md no longer states the clean-links doctrine — did it move?").toBeDefined();

    // Backticked names on that line, minus the trailing `=` in `from=`.
    const documented = [...line.matchAll(/`([a-z_*]+)=?`/g)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThanOrEqual(5);

    for (const name of documented) {
      if (name.endsWith("*")) {
        expect(TRACKING_PARAM_PREFIXES, `AGENTS.md names ${name}`).toContain(name.slice(0, -1));
      } else {
        expect(TRACKING_PARAMS.has(name), `AGENTS.md names \`${name}\` but it is not stripped`).toBe(true);
      }
    }
  });

  it.each([
    ["Spotify share link", "https://open.spotify.com/artist/abc?si=TRACK", "https://open.spotify.com/artist/abc"],
    ["YouTube share link", "https://youtu.be/xyz?si=TRACK", "https://youtu.be/xyz"],
    ["Bandcamp embed referrer", "https://band.bandcamp.com/?from=embed", "https://band.bandcamp.com/"],
    ["utm_ campaign params", "https://example.com/a?utm_source=n&utm_medium=e", "https://example.com/a"],
    ["dlsi", "https://example.com/a?dlsi=x", "https://example.com/a"],
    ["nd", "https://example.com/a?nd=1", "https://example.com/a"],
  ])("strips %s", (_label, input, expected) => {
    expect(normalizeHttpUrl(input)).toBe(expected);
  });

  it("PRESERVES params that are not tracking", () => {
    // The failure mode on the other side: over-stripping breaks a YouTube
    // timestamp or a playlist id the artist deliberately shared.
    expect(normalizeHttpUrl("https://youtu.be/xyz?t=120")).toBe("https://youtu.be/xyz?t=120");
    expect(normalizeHttpUrl("https://example.com/a?list=PL1&v=2")).toBe("https://example.com/a?list=PL1&v=2");
  });

  it("keeps the path and hash intact while stripping the query", () => {
    expect(normalizeHttpUrl("https://example.com/deep/path?si=x#section")).toBe(
      "https://example.com/deep/path#section",
    );
  });

  it("strips a tracking param mixed in with legitimate ones", () => {
    expect(normalizeHttpUrl("https://youtu.be/xyz?si=TRACK&t=120")).toBe("https://youtu.be/xyz?t=120");
  });

  it("matches param names case-insensitively", () => {
    expect(normalizeHttpUrl("https://example.com/a?SI=x&UTM_Source=y")).toBe("https://example.com/a");
  });

  it("applies to stored social links, which is the path that reaches D1", () => {
    // normalizeHttpUrl being correct is not enough — the doctrine is about what
    // gets STORED, so assert through the sanitizer the write path actually uses.
    const stored = JSON.parse(
      sanitizeBandSocialLinks(JSON.stringify({ spotify: "https://open.spotify.com/artist/abc?si=TRACK" })),
    );
    expect(stored.spotify).toBe("https://open.spotify.com/artist/abc");
  });
});
