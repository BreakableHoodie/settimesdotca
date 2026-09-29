import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// An HTML page served without a declared charset is decoded by the browser's
// guess, often Windows-1252, which renders "✓" as "âœ“" and an em dash as "â€”".
// The unsubscribe page did exactly that. Every HTML response from a Pages
// Function must declare UTF-8 in the header AND in the document (a saved or
// re-served page has no header).

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
const FILES = walk(join(REPO, "functions")).map((file) => ({
  file: relative(REPO, file),
  source: readFileSync(file, "utf8"),
}));

// A Content-Type header value of text/html with nothing after it. The email
// payload shape `{ type: "text/html", value }` is a MIME part, not a header.
const BARE_HTML_HEADER = /["']Content-Type["']\s*:\s*["']text\/html["']/i;

describe("HTML pages served by Pages Functions declare UTF-8", () => {
  it("no response sets Content-Type text/html without a charset", () => {
    const offenders = FILES.filter(({ source }) => BARE_HTML_HEADER.test(source)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("every HTML document carries <meta charset>", () => {
    const docs = FILES.filter(({ source }) => /<html[\s>]/i.test(source));
    expect(docs.length).toBeGreaterThanOrEqual(4);
    const offenders = docs.filter(({ source }) => !/<meta charset=/i.test(source)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the header detector can say yes", () => {
    expect(BARE_HTML_HEADER.test(`headers: { "Content-Type": "text/html" }`)).toBe(true);
    expect(BARE_HTML_HEADER.test(`headers: { "Content-Type": "text/html; charset=utf-8" }`)).toBe(false);
  });
});
