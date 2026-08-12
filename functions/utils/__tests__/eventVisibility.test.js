import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publicEventStatusSql, archivedEventStatusSql, publishedEventStatusSql } from "../eventVisibility.js";

// Module-level so both source-scanning guards below share one walker.
// .ts is scanned even though functions/ is currently JS-only: a guard that
// silently stops covering a file type the day someone adds one is the exact
// failure mode guards exist to prevent. Mirrors the frontend half in
// frontend/src/__tests__/isPublishedGuard.test.js.
const SCANNED_EXTENSIONS = [".js", ".ts"];

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

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
// `events.status`. Until #799, `functions/api/admin/events/[id]/archive.js`
// also wrote it (`is_published = 0`) to keep the eventual column-drop
// migration safe. Archiving therefore UNPUBLISHED under the old column, so any
// public read path gated on bare `is_published = 1` silently returned zero
// rows the moment an event was archived. See functions/utils/eventVisibility.js
// for the full incident writeup.
//
// As of migration 0059 the column is DROPPED — it no longer exists in
// production or in the test schema, so this scan can no longer fail on a
// *live* column read. It stays in the suite as a permanent regression guard:
// the postmortem it encodes (a single dead column silently zeroing 13 public
// read paths at once) is worth more than the guard costs, and a future PR
// resurrecting `is_published` — say, by copy-pasting an old query or
// reverting this migration without reverting the callers — fails CI here
// instead of shipping.
//
// This is a source scan, not a runtime assertion (same technique as
// frontend/src/admin/utils/__tests__/bandFields.test.js): the bug is a string
// baked into a SQL template at module load time, so nothing about it is
// observable by calling the exported functions.
// --- Durable guard: every public `events` query goes through the helper ------
//
// The is_published scan below catches the OLD column, but not the more general
// failure: a public route querying `events` with NO status gate at all. That is
// how functions/s/[slug].js shipped an ungated JOIN while its two siblings for
// the same share slug (api/schedule/share.js, api/schedule/share/[slug].js)
// both gated correctly -- so an event unpublished after a link was shared still
// produced a crawler-facing OG card naming it and its bands.
//
// Found by hand-sweeping all 20 non-admin files that touch the table. This
// turns that sweep into a test so nobody has to repeat it.
//
// Known limit, stated plainly: this is a FILE-level scan. It catches "this file
// queries events and never imports the helper at all" -- which is exactly how
// s/[slug].js shipped -- but not "this file imports the helper and forgets it
// on one of several queries", because the import line alone satisfies the
// match. ESLint's unused-import rule covers the degenerate version of that
// (helper imported, used nowhere). A precise check would need SQL parsing;
// this catches the class that has actually occurred twice.
describe("public events queries use the shared visibility predicate", () => {
  const guardFile = fileURLToPath(import.meta.url);
  const root = path.join(path.dirname(guardFile), "../../");

  // Files that query `events` WITHOUT a status predicate, deliberately:
  //  - api/metrics.js — a WRITE path. `SELECT id FROM events WHERE id IN (...)`
  //    is an existence check before writing daily aggregates; it projects only
  //    `id`, returns nothing to the caller, and ingestion is fire-and-forget,
  //    so it is neither an exposure nor a probing oracle. Metrics for a draft
  //    an admin is previewing are still legitimate to record.
  //  - utils/timeConflicts.js — imported ONLY by functions/api/admin/**, which
  //    legitimately sees drafts. Gating it would break conflict detection on
  //    exactly the unpublished events admins are building.
  const UNGATED_BY_DESIGN = new Set(["api/metrics.js", "utils/timeConflicts.js"]);

  const QUERIES_EVENTS_RE = /\b(?:FROM|JOIN)\s+events\b/;
  const USES_HELPER_RE = /EventStatusSql|concludedEventSql/;

  it("has no non-admin file querying events without a status gate", () => {
    const offenders = [];
    for (const absPath of walk(root)) {
      const relPath = path.relative(root, absPath).split(path.sep).join("/");
      if (relPath.startsWith("api/admin/")) continue;
      if (relPath.split("/").includes("__tests__")) continue;
      if (relPath === "api/test-utils.js") continue;
      if (UNGATED_BY_DESIGN.has(relPath)) continue;

      const source = readFileSync(absPath, "utf8");
      if (QUERIES_EVENTS_RE.test(source) && !USES_HELPER_RE.test(source)) {
        offenders.push(relPath);
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `These files query the events table on a non-admin path with no status gate: ` +
            `${offenders.join(", ")}. Apply publicEventStatusSql()/publishedEventStatusSql()/` +
            `archivedEventStatusSql() from functions/utils/eventVisibility.js — or, if the query genuinely ` +
            `must see drafts (a write-path existence check, or an admin-only util), add it to ` +
            `UNGATED_BY_DESIGN in this guard WITH a comment saying why.`
        : undefined,
    ).toEqual([]);
  });
});

describe("is_published never read outside admin/test infrastructure", () => {
  const currentFile = fileURLToPath(import.meta.url);
  const functionsRoot = path.join(path.dirname(currentFile), "../../");

  // Directories/files exempt from the scan:
  //  - any __tests__/** path   — the guard tests below necessarily name the
  //    retired column in strings/comments to describe what they scan for.
  //  - functions/utils/eventVisibility.js — this predicate's own canonical
  //    home. Its header comment narrates the 2026-08-10 incident by name, and
  //    that postmortem is worth more than the exemption costs. A literal
  //    string scan would otherwise flag itself.
  //
  // As of migration 0059 the column is DROPPED from the schema entirely —
  // production and the test schema (functions/api/test-utils.js) alike. The
  // functions/api/test-utils.js exemption that used to sit here is GONE: it
  // existed only while the test schema mirrored production's dead column, and
  // production no longer has one to mirror. A stray "is_published" appearing
  // anywhere in functions/ now (test-utils.js included) is unambiguously a
  // regression, not schema parity, so it is no longer exempt.
  //
  // The functions/api/admin/** exemption came out earlier, with #799. It
  // existed so the admin write paths could keep the deprecated column in
  // lockstep with status, which kept #800 rollback-able. Admin no longer
  // writes it, so the whole of functions/ is in scope. Removing that
  // exemption is what PROVED #799 complete -- a missed admin write would have
  // failed this test instead of passing silently. This guard, and its
  // frontend twin (frontend/src/__tests__/isPublishedGuard.test.js), stay in
  // the suite even though the column is gone: they are what makes a
  // reintroduction of the 2026-08-10 failure mode fail CI instead of
  // shipping.
  const EXEMPT_EXACT = new Set(["utils/eventVisibility.js"]);

  function isExempt(relPath) {
    const normalized = relPath.split(path.sep).join("/");
    // No api/admin/** exemption since #799, and no api/test-utils.js
    // exemption since migration 0059: nothing in functions/ may name the
    // column outside __tests__/** and eventVisibility.js's own postmortem.
    if (normalized.split("/").includes("__tests__")) return true;
    if (EXEMPT_EXACT.has(normalized)) return true;
    return false;
  }

  // .ts is scanned even though functions/ is currently JS-only: a guard that
  // silently stops covering a file type the day someone adds one is the exact
  // failure mode guards exist to prevent. Mirrors the frontend half in
  // frontend/src/__tests__/isPublishedGuard.test.js.
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
        ? `is_published is retired (#799) and must not be read OR written anywhere in functions/ — ` +
            `found it in: ${offenders.join(", ")}. Use publicEventStatusSql()/archivedEventStatusSql()/` +
            `publishedEventStatusSql() from functions/utils/eventVisibility.js instead. There is no admin ` +
            `escape hatch: moving the file under functions/api/admin/** will NOT satisfy this guard, because ` +
            `admin writing the column is exactly what took the public site dark on 2026-08-10. Only ` +
            `__tests__/** and the EXEMPT_EXACT allowlist (genuine test/schema infrastructure) are exempt.`
        : undefined,
    ).toEqual([]);
  });
});
