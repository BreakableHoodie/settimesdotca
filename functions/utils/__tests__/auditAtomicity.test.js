import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { auditLogStatement } from "../auditLogStatement.js";

// __tests__ -> utils -> functions -> repo root (four levels, not three: the
// first dirname strips the filename itself).
const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

/**
 * #955: a destructive admin action and its audit row were two independent
 * statements, so they could disagree in both directions — a failed DELETE left
 * an audit row claiming the deletion happened, and a failed audit INSERT was
 * swallowed while the row was deleted unlogged. The second is worse: for a
 * destructive action, who deleted what is exactly what the trail exists for.
 *
 * `auditLog` still deliberately never throws for its other callers, whose work
 * may have external side effects (an email sent, a digest flushed) that a
 * rollback cannot undo. Only the DB-only destructive paths are batched.
 */
describe("auditLogStatement", () => {
  it("returns a prepared statement instead of executing one", () => {
    const run = vi.fn();
    const bind = vi.fn(() => ({ run }));
    const env = { DB: { prepare: vi.fn(() => ({ bind })) } };

    const stmt = auditLogStatement(env, 1, "venue.deleted", "venue", 9, { a: 1 }, "1.2.3.4");

    expect(env.DB.prepare).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(stmt).toBeDefined();
  });

  it("serialises details and defaults the ip, matching auditLog's bindings", () => {
    const bind = vi.fn(() => ({ run: vi.fn() }));
    const env = { DB: { prepare: vi.fn(() => ({ bind })) } };

    auditLogStatement(env, 1, "venue.deleted", "venue", 9, { venueName: "Blue Room" }, undefined);

    expect(bind).toHaveBeenCalledWith(
      1,
      "venue.deleted",
      "venue",
      9,
      JSON.stringify({ venueName: "Blue Room" }),
      "unknown",
    );
  });

  it("passes null details through as null rather than the string 'null'", () => {
    const bind = vi.fn(() => ({ run: vi.fn() }));
    const env = { DB: { prepare: vi.fn(() => ({ bind })) } };

    auditLogStatement(env, 1, "venue.deleted", "venue", 9, null, "1.2.3.4");

    expect(bind.mock.calls[0][4]).toBeNull();
  });
});

/**
 * Source scan. The runtime tests above cover the statement builder; this covers
 * the property that matters at each call site — that the destructive path uses
 * the STATEMENT form (which can only reach D1 inside a batch) rather than the
 * fire-and-forget `auditLog`, which executes on its own and swallows failures.
 *
 * Deliberately not asserting the shape of the batch call: two of these build a
 * statement array in a variable and pass it (`DB.batch(cleanupStmts)`), so a
 * regex for the inline `DB.batch([...])` form reports a false negative. It did,
 * on users/[id].js, before this was rewritten.
 */
describe("destructive admin handlers audit via a batched statement", () => {
  const sites = [
    ["functions/utils/bandProfileResource.js", "band_profile.deleted"],
    ["functions/api/admin/bands/[id].js", "band.deleted"],
    ["functions/api/admin/events/[id].js", "event.deleted"],
    ["functions/api/admin/users/[id].js", "user.deleted"],
    ["functions/api/admin/venues/[id].js", "venue.deleted"],
  ];

  it.each(sites)("%s audits %s as a statement, not a bare call", (file, action) => {
    const source = readFileSync(join(repoRoot, file), "utf8");

    expect(source, `${file} should import auditLogStatement`).toContain("auditLogStatement");
    expect(source, `${file} should batch its writes`).toContain("DB.batch(");

    // The executing form must not be used for this action: a bare auditLog runs
    // on its own and cannot roll back with the delete.
    const bare = new RegExp(`auditLog\\([^)]*?${action.replace(".", "\\.")}`, "s");
    expect(
      bare.test(source.replace(/auditLogStatement\(/g, "STATEMENT(")),
      `${file}: "${action}" still uses the bare auditLog`,
    ).toBe(false);
  });
});
