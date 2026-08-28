// Guard: functions/ has a single entry point for reading a JSON request body.
//
// The bug class: `await request.json().catch(() => ({}))` was the standing idiom, and
// its `.catch` only fires on a PARSE FAILURE. A body of the literal `null` parses fine
// and resolves to `null`, so the catch never ran and the next line's property read threw
// a TypeError -- an opaque 500 where a 400 was correct (#975). The fix was one shared
// helper; this keeps it the only one.
//
// THE DETECTOR IS THE HARD PART, and two hand-rolled attempts were both wrong:
//
//   1. Two regexes stripping comments then matching. `//` inside a string literal ate
//      the rest of the line, so `const u = "https://x"; await request.json();` became
//      `const u = "https:` and the forbidden call was INVISIBLE. It also flagged
//      `request.json()` written inside a string as a violation.
//   2. A hand-written state machine tracking string/template/comment state. Better, but
//      it blanked a template literal wholesale -- so `` `${await request.json()}` ``
//      was invisible too, because a substitution is CODE inside a literal.
//
// Both passed a mutation test. That is the lesson worth keeping: mutating one instance
// proves the guard can fire, not that the detector is sound. The mutation that caught #1
// only worked because the file chosen happened to have no URL on that line.
//
// So this uses a real JavaScript parser. acorn resolves the string/template/comment
// question by construction, because it is the same problem a parser already solved.
//
// SCOPE, stated honestly: this matches a CallExpression on `<something>.request.json()`
// or `request.json()`. It does NOT follow aliases -- `const r = request; r.json()` slips
// past, and would need scope analysis to catch. It catches the idiom the codebase
// actually writes.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANONICAL = "utils/request.js";

// Deliberately EMPTY. bands/bulk.js was the one entry here: it answered a malformed body
// with its own "Invalid JSON body" 400, which the lenient helper could not express.
// Adding parseJsonObjectBodyStrict removed the need for the exception rather than the
// need for the rule -- an allowlist that grows is a guard being negotiated away, and the
// cause is usually a missing contract, not a missing exemption.
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

// True for `request.json(...)` and `ctx.request.json(...)`, false for the same text
// appearing in a string, a comment, or a template's literal half.
function isRequestJsonCall(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee?.type !== "MemberExpression") return false;
  if (callee.property?.name !== "json") return false;
  const obj = callee.object;
  return obj?.name === "request" || obj?.property?.name === "request";
}

export function callsRequestJson(source) {
  // A parse failure must THROW rather than return false: silently skipping an
  // unparseable file would hide exactly the violation this exists to find.
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", allowAwaitOutsideFunction: true });

  let found = false;
  const visit = (node) => {
    if (found || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node.type === "string" && isRequestJsonCall(node)) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key !== "loc" && key !== "range") visit(node[key]);
    }
  };
  visit(ast);
  return found;
}

describe("JSON request parsing has a single entry point", () => {
  // The DETECTOR is tested, not merely used. Cases 1-2 are the two shapes that defeated
  // the hand-rolled versions; the rest pin the behaviour a naive matcher gets wrong in
  // the other direction.
  it.each([
    ['const u = "https://example.test"; await request.json();', true, "a URL literal does not hide the call"],
    ["const x = `${await request.json()}`;", true, "a template substitution is code, not literal text"],
    ["await context.request.json();", true, "member-access form"],
    ['const doc = "call request.json() to parse";', false, "a mention inside a string is not a call"],
    ["// await request.json();\nconst a = 1;", false, "a line comment is not a call"],
    ["/* await request.json(); */ const a = 1;", false, "a block comment is not a call"],
    ["const t = `see request.json() docs`;", false, "a mention in a template's literal half is not a call"],
    ["const s = 'a\\'b request.json()';", false, "an escaped quote does not end the literal early"],
    ["await request.text();", false, "a different method is not a match"],
  ])("%s -> %s (%s)", (source, expected) => {
    expect(callsRequestJson(source)).toBe(expected);
  });

  it("only the request utility calls request.json() directly", () => {
    const offenders = sourceFiles(FUNCTIONS_DIR)
      .filter((file) => callsRequestJson(readFileSync(file, "utf8")))
      .map((file) => relative(FUNCTIONS_DIR, file))
      .filter((file) => file !== CANONICAL && !EXCEPTIONS.has(file));

    expect(
      offenders,
      "These files call request.json() directly. Import parseJsonObjectBody (lenient: a " +
        "malformed body becomes {}) or parseJsonObjectBodyStrict (a malformed body is " +
        `rejected) from functions/${CANONICAL}:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
