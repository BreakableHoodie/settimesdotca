import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANONICAL = "utils/request.js";

// Deliberately EMPTY. bulk.js was the one entry here: it answered a malformed body with
// its own "Invalid JSON body" 400, which the lenient helper could not express. Adding
// parseJsonObjectBodyStrict removed the need for the exception rather than the need for
// the rule -- an allowlist that grows is a guard being negotiated away, and the fix is
// usually a missing contract, not a missing exemption.
const EXCEPTIONS = new Set([]);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" || entry === "node_modules" ? [] : sourceFiles(full);
    }
    return entry.endsWith(".js") ? [full] : [];
  });
}

// A single left-to-right pass, because ORDER MATTERS and a pair of regexes cannot get
// it right. Stripping comments first destroys code: `const u = "https://x"; request.json()`
// has `//` INSIDE a string literal, so /\/\/.*/ ate the rest of the line and hid the call
// entirely -- the guard passed on a file that violated it. Stripping strings first has the
// mirror flaw: `// see "foo` opens a literal that never closes. Only one scanner that knows
// which state it is in can tell a comment from a URL, so this walks the source once,
// tracking whether it is in a string, a template, or a comment, and blanks out everything
// that is not code.
//
// Found by review, NOT by the mutation test -- which passed only because the file it
// mutated happened to have no URL on that line. Mutating one instance proves the guard
// can fire; it does not prove the detector is sound.
function codeOnly(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        i += source[i] === "\\" ? 2 : 1;
      }
      i++;
      out += " ";
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

describe("JSON request parsing has a single entry point", () => {
  // The scanner itself is tested, not just used. The regex version passed both of the
  // first two cases wrongly, and the mutation test did not catch it.
  it("codeOnly survives a URL literal and ignores a mention in a string", () => {
    // A `//` inside a string literal must NOT swallow the rest of the line.
    expect(codeOnly('const u = "https://example.test"; await request.json();')).toContain("request.json()");
    // A template literal too.
    expect(codeOnly("const u = `https://x`; await request.json();")).toContain("request.json()");
    // A genuine mention inside a string is NOT a call.
    expect(codeOnly('const doc = "call request.json() to parse";')).not.toContain("request.json()");
    // A genuine comment is still stripped.
    expect(codeOnly("// await request.json();\nconst a = 1;")).not.toContain("request.json()");
    expect(codeOnly("/* await request.json(); */ const a = 1;")).not.toContain("request.json()");
    // An escaped quote must not end the literal early.
    expect(codeOnly('const s = "a\\"b request.json()";')).not.toContain("request.json()");
  });

  it("only the request utility calls request.json() directly", () => {
    const offenders = sourceFiles(FUNCTIONS_DIR)
      .filter((file) => /\brequest\.json\s*\(/.test(codeOnly(readFileSync(file, "utf8"))))
      .map((file) => relative(FUNCTIONS_DIR, file))
      .filter((file) => file !== CANONICAL && !EXCEPTIONS.has(file));

    expect(
      offenders,
      `These files call request.json() directly. Import parseJsonObjectBody from ` +
        `functions/utils/request.js instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
