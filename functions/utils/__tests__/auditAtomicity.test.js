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
 * Source scan. The runtime tests above cover the statement builder; this proves
 * the property that matters at each call site: the audit statement and its
 * DELETE are entries in the SAME `DB.batch(...)` call.
 *
 * Checking for `auditLogStatement` and `DB.batch` independently is not enough —
 * `auditLogStatement(...).run()` after a delete-only batch would satisfy that
 * while restoring the split exactly. So the batch payload is extracted and both
 * markers must appear inside it.
 *
 * Two shapes exist and both must be handled: an inline `DB.batch([...])`, and a
 * statement array built in a variable and passed as `DB.batch(cleanupStmts)`.
 * An inline-only regex reports a false negative on the latter — it did, on
 * users/[id].js.
 */
function batchPayloads(source) {
  const payloads = [];

  const balancedFrom = (openIndex) => {
    let depth = 0;
    for (let i = openIndex; i < source.length; i += 1) {
      const c = source[i];
      if (c === "[") depth += 1;
      else if (c === "]") {
        depth -= 1;
        if (depth === 0) return source.slice(openIndex, i + 1);
      }
    }
    return "";
  };

  for (const match of source.matchAll(/DB\.batch\(\s*(\[|[A-Za-z_$][\w$]*)/g)) {
    const token = match[1];
    if (token === "[") {
      payloads.push(balancedFrom(match.index + match[0].lastIndexOf("[")));
      continue;
    }
    // Variable form: find the array literal assigned to that identifier.
    const decl = source.indexOf(`${token} = [`);
    if (decl !== -1) payloads.push(balancedFrom(source.indexOf("[", decl)));
  }

  return payloads;
}

/**
 * The scanner is itself guard code, so it is exercised against sources it must
 * REJECT as well as ones it must accept. Synthetic strings rather than mutating
 * a real handler: the bypass shape is what matters, not which file wears it.
 */
describe("the batch scanner", () => {
  const AUDIT = 'auditLogStatement(env, 1, "venue.deleted", "venue", id, {}, ip)';

  it("accepts an inline batch holding both statements", () => {
    const src = `await DB.batch([DB.prepare("DELETE FROM venues WHERE id = ?").bind(id), ${AUDIT}]);`;
    const ok = batchPayloads(src).some(
      (p) => p.includes("venue.deleted") && p.includes("auditLogStatement") && /DELETE FROM/i.test(p),
    );
    expect(ok).toBe(true);
  });

  it("accepts the variable form, which an inline-only regex misses", () => {
    const src = `const stmts = [DB.prepare("DELETE FROM venues WHERE id = ?").bind(id), ${AUDIT}];\nawait DB.batch(stmts);`;
    const ok = batchPayloads(src).some(
      (p) => p.includes("venue.deleted") && p.includes("auditLogStatement") && /DELETE FROM/i.test(p),
    );
    expect(ok).toBe(true);
  });

  // The bypass: both symbols are present in the file, but the audit runs on its
  // own after a delete-only batch — the split this whole change removes.
  it("REJECTS a delete-only batch with the audit executed separately", () => {
    const src = `await DB.batch([DB.prepare("DELETE FROM venues WHERE id = ?").bind(id)]);\nawait ${AUDIT}.run();`;

    expect(src).toContain("auditLogStatement");
    expect(src).toContain("DB.batch(");

    const ok = batchPayloads(src).some(
      (p) => p.includes("venue.deleted") && p.includes("auditLogStatement") && /DELETE FROM/i.test(p),
    );
    expect(ok, "a delete-only batch with a separate audit must not pass").toBe(false);
  });
});

describe("destructive admin handlers batch their audit row", () => {
  const sites = [
    ["functions/utils/bandProfileResource.js", "band_profile.deleted"],
    ["functions/api/admin/bands/[id].js", "band.deleted"],
    ["functions/api/admin/bands/bulk.js", "band_profile.deleted"],
    ["functions/api/admin/bands/bulk.js", "band.deleted"],
    ["functions/api/admin/events/[id].js", "event.deleted"],
    ["functions/api/admin/users/[id].js", "user.deleted"],
    ["functions/api/admin/venues/[id].js", "venue.deleted"],
  ];

  it.each(sites)("%s puts %s in the same batch as its DELETE", (file, action) => {
    const source = readFileSync(join(repoRoot, file), "utf8");

    const together = batchPayloads(source).some(
      (payload) => payload.includes(action) && payload.includes("auditLogStatement") && /DELETE FROM/i.test(payload),
    );

    expect(together, `${file}: "${action}" is not in the same DB.batch(...) as its DELETE`).toBe(true);
  });
});
