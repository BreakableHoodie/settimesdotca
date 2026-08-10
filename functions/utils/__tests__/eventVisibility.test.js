import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publicEventStatusSql, archivedEventStatusSql, publishedEventStatusSql } from "../eventVisibility.js";

describe("publicEventStatusSql", () => {
  it("returns the unaliased predicate by default", () => {
    expect(publicEventStatusSql()).toBe("status IN ('published', 'archived')");
  });

  it("prefixes the given alias", () => {
    expect(publicEventStatusSql("e")).toBe("e.status IN ('published', 'archived')");
    expect(publicEventStatusSql("e2")).toBe("e2.status IN ('published', 'archived')");
  });

  it("throws on an alias that isn't a plain SQL identifier", () => {
    // The alias is always a hardcoded literal in real callers, but this
    // function must not silently become an injection vector if that
    // invariant is ever broken — see the header comment in eventVisibility.js.
    expect(() => publicEventStatusSql("e; DROP TABLE events;--")).toThrow();
    expect(() => publicEventStatusSql("e.status")).toThrow();
    expect(() => publicEventStatusSql(" e")).toThrow();
    expect(() => publicEventStatusSql("1e")).toThrow();
  });
});

describe("archivedEventStatusSql", () => {
  it("returns the unaliased predicate by default", () => {
    expect(archivedEventStatusSql()).toBe("status = 'archived'");
  });

  it("prefixes the given alias", () => {
    expect(archivedEventStatusSql("e2")).toBe("e2.status = 'archived'");
  });

  it("throws on an invalid alias", () => {
    expect(() => archivedEventStatusSql("e; DROP TABLE events;--")).toThrow();
  });
});

describe("publishedEventStatusSql", () => {
  it("returns the unaliased predicate by default", () => {
    expect(publishedEventStatusSql()).toBe("status = 'published'");
  });

  it("prefixes the given alias", () => {
    expect(publishedEventStatusSql("e")).toBe("e.status = 'published'");
  });

  it("excludes archived, unlike publicEventStatusSql", () => {
    // The distinction that matters: /api/schedule?event=current must not serve
    // an event archived on its own final day as tonight's live schedule.
    expect(publishedEventStatusSql()).not.toContain("archived");
    expect(publicEventStatusSql()).toContain("archived");
  });

  it("throws on an invalid alias", () => {
    expect(() => publishedEventStatusSql("e; DROP TABLE events;--")).toThrow();
  });
});

describe("alias validation rejects non-strings", () => {
  // String(null) === "null", which matches the identifier pattern. Without an
  // explicit typeof guard, a null alias would pass validation and then quietly
  // fall through to an unaliased column, producing valid-but-wrong SQL in a
  // multi-table join. Regression guard for that exact hole.
  it.each([[null], [0], [1], [{}], [[]], [true]])("throws for %p", (value) => {
    expect(() => publicEventStatusSql(value)).toThrow(/invalid table alias/);
    expect(() => archivedEventStatusSql(value)).toThrow(/invalid table alias/);
    expect(() => publishedEventStatusSql(value)).toThrow(/invalid table alias/);
  });
});

// --- Durable guard: `is_published` must never be read on a public path -----
//
// `events.is_published` was deprecated in migration 0005 in favour of
// `events.status`, but `functions/api/admin/events/[id]/archive.js` still
// writes it (`is_published = 0`) to keep the eventual column-drop migration
// safe. Archiving therefore UNPUBLISHES under the old column, so any public
// read path still gated on bare `is_published = 1` silently returns zero
// rows the moment an event is archived. See functions/utils/eventVisibility.js
// for the full incident writeup.
//
// This is a source scan, not a runtime assertion (same technique as
// frontend/src/admin/utils/__tests__/bandFields.test.js): the bug is a string
// baked into a SQL template at module load time, so nothing about it is
// observable by calling the exported functions.
describe("is_published never read outside admin/test infrastructure", () => {
  const currentFile = fileURLToPath(import.meta.url);
  const functionsRoot = path.join(path.dirname(currentFile), "../../");

  // Directories/files exempt from the scan:
  //  - functions/api/admin/**  — admin write paths must keep writing
  //    is_published in lockstep with status (rollback safety for the
  //    eventual column-drop migration); not a public read path.
  //  - any __tests__/** path   — test fixtures legitimately seed/assert
  //    against the deprecated column (e.g. verifying archive.js's write, or
  //    an impossible-state regression guard).
  //  - functions/api/test-utils.js — the shared test D1 schema. Its
  //    CREATE TABLE mirrors production (which still has the column); this is
  //    schema parity, not a read.
  //  - functions/utils/eventVisibility.js — this predicate's own canonical
  //    home. Its header comment documents the deprecated column by name, so
  //    a literal string scan would otherwise flag itself.
  const EXEMPT_EXACT = new Set(["api/test-utils.js", "utils/eventVisibility.js"]);

  function isExempt(relPath) {
    const normalized = relPath.split(path.sep).join("/");
    if (normalized.startsWith("api/admin/")) return true;
    if (normalized.split("/").includes("__tests__")) return true;
    if (EXEMPT_EXACT.has(normalized)) return true;
    return false;
  }

  function walk(dir) {
    let files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(walk(full));
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(full);
      }
    }
    return files;
  }

  it("contains no bare is_published reads outside the allowlisted paths", () => {
    const offenders = [];
    for (const absPath of walk(functionsRoot)) {
      const relPath = path.relative(functionsRoot, absPath);
      if (isExempt(relPath)) continue;
      const source = readFileSync(absPath, "utf8");
      if (source.includes("is_published")) {
        offenders.push(relPath);
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `is_published must never be read on a public path (functions/utils/eventVisibility.js) — ` +
            `found it in: ${offenders.join(", ")}. Use publicEventStatusSql()/archivedEventStatusSql() instead, ` +
            `or add the file to functions/api/admin/**, a __tests__/** path, or the EXEMPT_EXACT allowlist ` +
            `in this guard if it's genuinely test/schema infrastructure.`
        : undefined,
    ).toEqual([]);
  });
});
