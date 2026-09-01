import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// e2e/band-profile-viewing.spec.js navigates client-side: the timeline's
// performer chips are react-router Links, so a click changes the URL via
// pushState and React renders the new route afterwards. `page.waitForURL(...)`
// resolves on that pushState BEFORE React renders, so any assertion issued
// right after it can still read the PREVIOUS page's DOM. This class is a real,
// repeated CI failure: waitForURL raced render, and for the event/upcoming
// tests `main a[href^="/event/"]` could match the HOMEPAGE timeline, passing
// without ever opening a profile.
//
// A navigation sweep on 2026-09-01 found raw waitForURL calls in 4 of 12 test
// sites despite the file's own header documenting exactly this hazard — nothing
// enforced it, so it was a repeat audit. This guard collapses that class into
// one failing test.
//
// Scope is deliberately honest: it guards THIS ONE FILE, where the openProfile
// helper lives. It is not a repo-wide rule — other specs may navigate and wait
// differently and that is fine until a helper there earns the same guard.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SPEC_PATH = resolve(REPO_ROOT, "e2e/band-profile-viewing.spec.js");

function findFunctionLineSpan(lines, signaturePattern) {
  const startIndex = lines.findIndex((line) => signaturePattern.test(line));
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let i = startIndex; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth === 0) {
      return { start: startIndex, end: i };
    }
  }

  return null;
}

describe("e2e band-profile navigation guard", () => {
  it("every waitForURL() call lives inside openProfile", () => {
    const source = readFileSync(SPEC_PATH, "utf8");
    const lines = source.split("\n");

    // Guards the guard: if openProfile is renamed or removed, the empty-match
    // case would otherwise make every assertion below vacuous. The function
    // existing is the precondition the whole rule rests on.
    const span = findFunctionLineSpan(lines, /async function openProfile\(/);
    expect(span, "openProfile(page, link) must still exist in the spec").not.toBeNull();

    const outOfBody = [];
    for (const [index, line] of lines.entries()) {
      if (!line.includes("waitForURL(")) continue;
      if (index < span.start || index > span.end) {
        outOfBody.push(`${index + 1}: ${line.trim()}`);
      }
    }

    expect(
      outOfBody,
      "waitForURL() resolves on pushState BEFORE React renders, so every call must " +
        "go through openProfile (which polls the heading until the new route is " +
        "actually rendered). Found outside openProfile:\n" +
        outOfBody.join("\n") +
        "\nConvert the test to use openProfile(page, link) instead.",
    ).toEqual([]);
  });
});
