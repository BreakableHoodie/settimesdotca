import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EditError,
  deleteLine,
  findLine,
  insertAfter,
  insertBefore,
  main,
  reindent,
  replaceLine,
  toPredicate,
} from "../edit-at.mjs";

const SOURCE = ["function demo() {", "  const value = 1", "  return value", "}", ""].join("\n");

describe("edit-at: anchors are matched, never guessed (#1069)", () => {
  it("finds a line by substring regardless of the indentation the caller imagined", () => {
    // The failure this removes: writing `const value = 1` with the wrong
    // leading whitespace and having the edit silently do nothing.
    const out = replaceLine(SOURCE, "const value = 1", "const value = 2");
    expect(out).toContain("  const value = 2");
    expect(out).not.toContain("const value = 1");
  });

  it("re-uses the matched line's own indent rather than the replacement's", () => {
    // Written flush-left; lands at the anchor's depth.
    const out = replaceLine(SOURCE, "return value", "return value * 2");
    expect(out.split("\n")).toContain("  return value * 2");
  });

  it("preserves relative indentation inside a multi-line replacement", () => {
    const out = replaceLine(SOURCE, "const value = 1", "if (ready) {\n  const value = 2\n}");
    const lines = out.split("\n");
    expect(lines).toContain("  if (ready) {");
    expect(lines).toContain("    const value = 2");
    expect(lines).toContain("  }");
  });

  it("--verbatim inserts exactly what it was given", () => {
    const out = replaceLine(SOURCE, "const value = 1", "const value = 2", { verbatim: true });
    expect(out.split("\n")).toContain("const value = 2");
  });
});

describe("edit-at: a replacement is spliced, never interpreted", () => {
  // The `$` class. In String.replace, `$&` expands to the whole match and `$$`
  // to a literal `$` -- which silently rewrote a regex (`\d` -> `\\d`) and a
  // Makefile recipe (`exit $$status` -> `exit $status`, so make expanded `$s`).
  it.each([
    ["$& (whole-match expansion)", "const re = /$&/"],
    ["$$ (escaped dollar)", "\texit $$status"],
    ["$1 (capture group)", "const x = '$1'"],
    ["$` and $'", 'const x = "$` and $\'"'],
  ])("inserts %s literally", (_label, replacement) => {
    const out = replaceLine(SOURCE, "const value = 1", replacement, { verbatim: true });
    expect(out).toContain(replacement);
  });
});

describe("edit-at: it fails loudly rather than doing nothing", () => {
  it("throws when the pattern matches no line", () => {
    // The silent no-op is the whole reason this module exists: twice in one
    // session an unmatched anchor produced a MUTATION THAT NEVER APPLIED, and
    // the green test run that followed read as proof the code was guarded.
    expect(() => replaceLine(SOURCE, "const missing = 0", "x")).toThrow(EditError);
    expect(() => replaceLine(SOURCE, "const missing = 0", "x")).toThrow(/matched no line/);
  });

  it("throws when the pattern matches more than one line, and shows them", () => {
    const repeated = ["  const a = 1", "  const b = 2", "  const a = 1", ""].join("\n");
    expect(() => replaceLine(repeated, "const a = 1", "x")).toThrow(/matched 2 lines/);
    expect(() => replaceLine(repeated, "const a = 1", "x")).toThrow(/line 1:/);
  });

  it("throws rather than writing a byte-identical file", () => {
    // A replacement equal to what is already there is a no-op wearing the
    // costume of an edit -- exactly what this tool exists to make impossible.
    expect(() => replaceLine(SOURCE, "const value = 1", "  const value = 1", { verbatim: true })).toThrow(
      /byte-identical/,
    );
  });

  it("names what it was doing when it failed", () => {
    expect(() => insertAfter(SOURCE, "nope", "x")).toThrow(/insert-after pattern/);
    expect(() => replaceLine(SOURCE, "nope", "x")).toThrow(/replace pattern/);
  });
});

describe("edit-at: the other operations", () => {
  it("inserts after the anchor", () => {
    const out = insertAfter(SOURCE, "const value = 1", "const extra = 2");
    const lines = out.split("\n");
    expect(lines[lines.indexOf("  const value = 1") + 1]).toBe("  const extra = 2");
  });

  it("inserts before the anchor", () => {
    const out = insertBefore(SOURCE, "return value", "const doubled = value * 2");
    const lines = out.split("\n");
    expect(lines[lines.indexOf("  return value") - 1]).toBe("  const doubled = value * 2");
  });

  it("deletes the anchor line", () => {
    const out = deleteLine(SOURCE, "const value = 1");
    expect(out).not.toContain("const value = 1");
    expect(out).toContain("return value");
  });
});

describe("edit-at: pattern forms", () => {
  // Patterns are substrings, never compiled. An earlier version accepted
  // /re/flags and built a RegExp from argv, which CodeQL flagged as regex
  // injection (high). Removed rather than suppressed: this repo fixes CodeQL
  // findings, and the only thing regex anchors were really for -- varying
  // whitespace -- is covered by --normalize-space without compiling anything.
  it("does not treat a /slash-wrapped/ pattern as a regex", () => {
    const predicate = toPredicate("/const\\s+value/");
    // Matched literally: no line contains those characters, so no match.
    expect(predicate("  const value = 1")).toBe(false);
    expect(predicate("  x = '/const\\s+value/'")).toBe(true);
  });

  it("matches across differing internal whitespace with normalizeSpace", () => {
    const predicate = toPredicate("const value = 1", { normalizeSpace: true });
    expect(predicate("  const   value   =   1")).toBe(true);
    expect(predicate("\tconst value = 1")).toBe(true);
    expect(predicate("  const other = 1")).toBe(false);
  });

  it("normalizeSpace is off by default, so spacing is significant", () => {
    expect(toPredicate("const value = 1")("  const   value   =   1")).toBe(false);
  });

  it("treats a bare string as a substring, not a regex", () => {
    // So a pattern containing regex metacharacters still matches literally.
    const predicate = toPredicate("value = 1");
    expect(predicate("  const value = 1")).toBe(true);
    const literal = toPredicate("a.c");
    expect(literal("  a.c")).toBe(true);
    expect(literal("  abc")).toBe(false);
  });

  it("reports the real indent of the matched line", () => {
    const { indent, index } = findLine(SOURCE.split("\n"), toPredicate("return value"));
    expect(indent).toBe("  ");
    expect(index).toBe(2);
  });

  it("reindent leaves blank lines empty rather than padded", () => {
    expect(reindent("a\n\nb", "    ")).toEqual(["    a", "", "    b"]);
  });
});

describe("edit-at: line endings and regex state", () => {
  // A CRLF replacement split on "\n" alone leaves a trailing \r on every line;
  // applyToSource then joins with \r\n and writes \r\r\n. The file grows an
  // invisible character per inserted line, which is the worst kind of edit bug
  // -- it looks right in a diff viewer that hides them.
  it("does not double the carriage return when both file and replacement are CRLF", () => {
    const crlf = ["function demo() {", "  const value = 1", "}", ""].join("\r\n");
    const out = replaceLine(crlf, "const value = 1", "const a = 1\r\nconst b = 2");
    expect(out).not.toMatch(/\r\r/);
    expect(out.split("\r\n")).toContain("  const a = 1");
    expect(out.split("\r\n")).toContain("  const b = 2");
  });

  it("keeps a CRLF file's line endings rather than converting it to LF", () => {
    const crlf = ["a", "  target", "b", ""].join("\r\n");
    const out = replaceLine(crlf, "target", "replaced");
    expect(out).toContain("\r\n");
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("accepts an LF replacement into a CRLF file", () => {
    const crlf = ["a", "  target", "b", ""].join("\r\n");
    const out = replaceLine(crlf, "target", "one\ntwo");
    expect(out).not.toMatch(/\r\r/);
    expect(out.split("\r\n")).toContain("  one");
    expect(out.split("\r\n")).toContain("  two");
  });

  // The former sticky/global flag hazard is gone by construction: nothing is
  // compiled from a pattern any more, so there is no lastIndex to carry state
  // between lines. Kept as a note rather than a test of absent behaviour.
  it("finds every occurrence, so a repeated anchor is reported as ambiguous", () => {
    const repeated = ["  target", "  target", "  target", ""].join("\n");
    expect(() => replaceLine(repeated, "target", "x")).toThrow(/matched 3 lines/);
  });
});

describe("edit-at: an empty anchor is refused, never treated as 'everything'", () => {
  // `"".includes("")` is true, so an empty pattern matches EVERY line. On a
  // multi-line file that surfaces as an ambiguity error, which is safe. On a
  // SINGLE-line file it is exactly one match -- and the tool would replace the
  // whole file. A file editor must not have a spelling of "no anchor" that
  // quietly means "all of it".
  it("refuses an empty pattern on a one-line file rather than replacing it", () => {
    const oneLine = "the entire file";
    expect(() => replaceLine(oneLine, "", "REPLACED")).toThrow(/pattern is empty/);
    expect(() => replaceLine(oneLine, "", "REPLACED")).toThrow(/Nothing was written/);
  });

  it("refuses a whitespace-only pattern once normalizeSpace collapses it", () => {
    const oneLine = "the entire file";
    expect(() => replaceLine(oneLine, "   ", "REPLACED", { normalizeSpace: true })).toThrow(/pattern is empty/);
    expect(() => replaceLine(oneLine, "\t\t", "REPLACED", { normalizeSpace: true })).toThrow(/pattern is empty/);
  });

  it("refuses an empty pattern for every operation, not just replace", () => {
    const oneLine = "the entire file";
    expect(() => insertAfter(oneLine, "", "x")).toThrow(/pattern is empty/);
    expect(() => insertBefore(oneLine, "", "x")).toThrow(/pattern is empty/);
    expect(() => deleteLine(oneLine, "")).toThrow(/pattern is empty/);
  });

  it("still accepts a pattern that is only whitespace WITHOUT normalizeSpace", () => {
    // Two spaces is a legitimate literal anchor when spacing is significant.
    const src = ["a  b", "cd", ""].join("\n");
    expect(replaceLine(src, "  ", "replaced")).toContain("replaced");
  });
});

describe("edit-at: the CLI itself", () => {
  // The in-memory helpers above are the logic; `main` is argument parsing,
  // replacement-file loading, the write, and the exit code. All four can
  // regress without any of the tests above noticing.
  const tmp = () => join(mkdtempSync(join(tmpdir(), "edit-at-")), "file.txt");

  const write = (path, text) => {
    writeFileSync(path, text);
    return path;
  };

  it("applies a replacement read from a file and exits 0", () => {
    const file = write(tmp(), ["alpha", "  target", "omega", ""].join("\n"));
    const repl = write(tmp() + ".repl", "replaced\n");
    expect(main(["replace", file, "--match", "target", "--with-file", repl])).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("  replaced");
  });

  it("inserts $-laden text literally, which is the whole reason for --with-file", () => {
    const file = write(tmp(), ["alpha", "  target", ""].join("\n"));
    const repl = write(tmp() + ".repl", "const re = /^\\d{2}$/ // $& $$ $1\n");
    expect(main(["replace", file, "--match", "target", "--with-file", repl])).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("const re = /^\\d{2}$/ // $& $$ $1");
  });

  it("exits 1 and writes nothing when the anchor matches no line", () => {
    const original = ["alpha", "omega", ""].join("\n");
    const file = write(tmp(), original);
    const repl = write(tmp() + ".repl", "replaced\n");
    expect(main(["replace", file, "--match", "absent", "--with-file", repl])).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("exits 1 and writes nothing when the anchor is ambiguous", () => {
    const original = ["  target", "  target", ""].join("\n");
    const file = write(tmp(), original);
    const repl = write(tmp() + ".repl", "replaced\n");
    expect(main(["replace", file, "--match", "target", "--with-file", repl])).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("exits 4 on a usage error rather than pretending to work", () => {
    const file = write(tmp(), "alpha\n");
    expect(main(["replace", file, "--match", "alpha"])).toBe(4); // no --with-file
    expect(main(["frobnicate", file, "--match", "alpha"])).toBe(4); // unknown op
  });

  it("supports delete, insert-after and insert-before from the CLI", () => {
    const base = ["alpha", "  target", "omega", ""].join("\n");
    const repl = write(tmp() + ".repl", "added\n");

    const afterFile = write(tmp(), base);
    expect(main(["insert-after", afterFile, "--match", "target", "--with-file", repl])).toBe(0);
    expect(readFileSync(afterFile, "utf8").split("\n")[2]).toBe("  added");

    const beforeFile = write(tmp(), base);
    expect(main(["insert-before", beforeFile, "--match", "target", "--with-file", repl])).toBe(0);
    expect(readFileSync(beforeFile, "utf8").split("\n")[1]).toBe("  added");

    const deleteFile = write(tmp(), base);
    expect(main(["delete", deleteFile, "--match", "target"])).toBe(0);
    expect(readFileSync(deleteFile, "utf8")).not.toContain("target");
  });

  it("--verbatim skips the re-indent", () => {
    const file = write(tmp(), ["alpha", "  target", ""].join("\n"));
    const repl = write(tmp() + ".repl", "flush\n");
    expect(main(["replace", file, "--match", "target", "--with-file", repl, "--verbatim"])).toBe(0);
    expect(readFileSync(file, "utf8").split("\n")).toContain("flush");
  });
});

describe("edit-at: an anchor may itself start with --", () => {
  // Value flags used to stop at anything beginning with "--", so
  // `--match --color-accent-500` set flags.match = true and the run died with
  // "--match <pattern> is required" -- an error about a flag that WAS given.
  //
  // Not hypothetical in this repo: `--color-accent-500` is a Tailwind theme
  // token used throughout the CSS, and every SQL comment in migrations/ starts
  // with "--". Both were unusable as anchors.
  const tmp = () => join(mkdtempSync(join(tmpdir(), "edit-at-flag-")), "file.txt");
  const write = (path, text) => {
    writeFileSync(path, text);
    return path;
  };

  it.each([
    ["a CSS custom property", "  --color-accent-500: #f97316;", "--color-accent-500"],
    ["a SQL comment", "-- seed the venues", "-- seed the venues"],
    ["a bare double dash", "-- ", "--"],
  ])("accepts %s as the anchor", (_label, line, pattern) => {
    const file = write(tmp(), [line, "untouched", ""].join("\n"));
    const repl = write(tmp() + ".repl", "REPLACED\n");
    expect(main(["replace", file, "--match", pattern, "--with-file", repl])).toBe(0);
    const out = readFileSync(file, "utf8");
    expect(out).toContain("REPLACED");
    expect(out).toContain("untouched");
  });

  it("accepts the --match=<pattern> form", () => {
    const file = write(tmp(), ["  --color-accent-500: #f97316;", "untouched", ""].join("\n"));
    const repl = write(tmp() + ".repl", "REPLACED\n");
    expect(main(["replace", file, "--match=--color-accent-500", "--with-file", repl])).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("REPLACED");
  });

  it("a --with-file path starting with -- is still read as the path", () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-at-dash-"));
    const file = write(join(dir, "file.txt"), ["  target", ""].join("\n"));
    const repl = write(join(dir, "--repl.txt"), "REPLACED\n");
    expect(main(["replace", file, "--match", "target", "--with-file", repl])).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("REPLACED");
  });

  it("still reports a genuinely missing value rather than eating the next flag", () => {
    const file = write(tmp(), ["  target", ""].join("\n"));
    // --match with nothing after it must fail as "required", not swallow --verbatim.
    expect(main(["replace", file, "--match"])).toBe(4);
  });
});
