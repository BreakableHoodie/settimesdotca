// Guard: the global `/*` rule in _headers must not declare Cache-Control.
//
// A `_headers` rule COMBINES with every other rule matching the same path
// rather than being overridden by the more specific one. So `/*` declaring
// `no-cache, no-store, must-revalidate` joined with `/assets/*`'s
// `public, max-age=31536000, immutable` to produce BOTH, comma-separated —
// and `no-store` wins. Every content-hashed bundle was re-downloaded on every
// navigation, and `cf-cache-status` reported BYPASS, so the edge cached
// nothing either (#987).
//
// The stale-HTML risk the line was defending against is handled by the
// platform: Pages serves HTML with `public, max-age=0, must-revalidate` by
// default, which revalidates on every request.
//
// MEASURE WITH GET, NEVER HEAD. The original #987 diagnosis was half wrong
// because it used `curl -I`: the API Functions export only `onRequestGet`, so
// a HEAD request falls through to the SPA shell and reports the shell's
// headers. On GET the API tiers were correct all along; only the static
// assets were actually broken.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HEADERS_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "public", "_headers");

/**
 * Parse _headers into [{ path, headers: {name: value} }].
 * A rule starts at a non-indented, non-comment line; its headers are the
 * indented `Name: value` lines that follow.
 */
function parseHeaders(source) {
  const rules = [];
  let current = null;
  for (const raw of source.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { path: raw.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const match = raw.trim().match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (match && current) current.headers[match[1].toLowerCase()] = match[2];
  }
  return rules;
}

describe("_headers cache policy (#987)", () => {
  const rules = parseHeaders(readFileSync(HEADERS_FILE, "utf8"));

  it("parses the file it is guarding", () => {
    expect(rules.length).toBeGreaterThan(10);
    expect(rules.some((r) => r.path === "/*")).toBe(true);
    expect(rules.some((r) => r.path === "/assets/*")).toBe(true);
  });

  it("the global /* rule declares no Cache-Control", () => {
    const star = rules.find((r) => r.path === "/*");
    expect(
      star.headers["cache-control"],
      "A Cache-Control on /* is comma-JOINED into every other rule, so a no-store " +
        "there silently poisons /assets/*'s immutable caching and forces cf-cache-status " +
        "to BYPASS. Set cache policy on specific paths instead (#987).",
    ).toBeUndefined();
  });

  it("hashed assets are still declared immutable", () => {
    const assets = rules.find((r) => r.path === "/assets/*");
    expect(assets.headers["cache-control"]).toMatch(/immutable/);
    expect(assets.headers["cache-control"]).not.toMatch(/no-store/);
  });

  it("no rule pairs no-store with a positive max-age", () => {
    const contradictory = rules
      .filter((r) => {
        const cc = r.headers["cache-control"];
        return cc && /no-store/.test(cc) && /max-age=[1-9]/.test(cc);
      })
      .map((r) => `${r.path}: ${r.headers["cache-control"]}`);
    expect(contradictory, "no-store defeats any max-age beside it").toEqual([]);
  });
});
