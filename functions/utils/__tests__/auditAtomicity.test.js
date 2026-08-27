import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { auditLogStatement, auditLogStatementForInsertedRow } from "../auditLogStatement.js";
import { onRequestPatch } from "../../api/admin/bands/bulk.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../api/test-utils.js";

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

  const balancedFrom = (openIndex, open = "[", close = "]") => {
    let depth = 0;
    for (let i = openIndex; i < source.length; i += 1) {
      const c = source[i];
      if (c === open) depth += 1;
      else if (c === close) {
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
    // Variable form: the payload is what actually lands in the array — its
    // literal contents PLUS anything pushed onto it before the batch call.
    // A raw text slice from the declaration to the batch is not equivalent and
    // was a live bypass: it also swallows statements executed on their own in
    // that window, so a sequential `.run()` delete written after the
    // declaration read as batched. Verified by mutation, 2026-08-25.
    const decl = source.indexOf(`${token} = [`);
    if (decl === -1) continue;
    let payload = balancedFrom(source.indexOf("[", decl));
    const pushToken = `${token}.push(`;
    for (let at = source.indexOf(pushToken, decl); at !== -1 && at < match.index;) {
      payload += balancedFrom(at + pushToken.length - 1, "(", ")");
      at = source.indexOf(pushToken, at + pushToken.length);
    }
    payloads.push(payload);
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

  const passes = (src) =>
    batchPayloads(src).some(
      (p) => p.includes("venue.deleted") && p.includes("auditLogStatement") && /DELETE FROM/i.test(p),
    );

  it("accepts the variable form with the audit pushed on after the literal", () => {
    const src = `let stmts;\nstmts = [DB.prepare("DELETE FROM venues WHERE id = ?").bind(id)];\nstmts.push(${AUDIT});\nawait DB.batch(stmts);`;
    expect(passes(src)).toBe(true);
  });

  // The second bypass, found by mutation. Both symbols are present AND a batch
  // exists, but the delete runs on its own between the declaration and the
  // batch — so only the audit is ever batched.
  it("REJECTS a delete executed separately after the array is declared", () => {
    const src = `let stmts;\nstmts = [];\nawait DB.prepare("DELETE FROM venues WHERE id = ?").bind(id).run();\nstmts.push(${AUDIT});\nawait DB.batch(stmts);`;

    expect(src).toContain("auditLogStatement");
    expect(src).toContain("DB.batch(");

    expect(passes(src), "a separately-executed delete must not read as batched").toBe(false);
  });
});

describe("destructive admin handlers batch their audit row", () => {
  // The table is named per site rather than checking for a generic DELETE: these
  // handlers delete from several tables, so a generic check can be satisfied by
  // the WRONG one. `bands/[id].js` also issues DELETE FROM band_announce_queue,
  // which would let "band.deleted" pass with its performances delete removed.
  const sites = [
    ["functions/utils/bandProfileResource.js", "band_profile.deleted", /DELETE\s+FROM\s+band_profiles\b/i],
    ["functions/api/admin/bands/[id].js", "band.deleted", /DELETE\s+FROM\s+performances\b/i],
    ["functions/api/admin/bands/bulk.js", "band_profile.deleted", /DELETE\s+FROM\s+band_profiles\b/i],
    ["functions/api/admin/bands/bulk.js", "band.deleted", /DELETE\s+FROM\s+performances\b/i],
    ["functions/api/admin/bands/bulk.js", "band.bulk_${action}", /DELETE\s+FROM\s+performances\b/i],
    ["functions/api/admin/events/[id].js", "event.deleted", /DELETE\s+FROM\s+events\b/i],
    ["functions/api/admin/users/[id].js", "user.deleted", /DELETE\s+FROM\s+users\b/i],
    ["functions/api/admin/venues/[id].js", "venue.deleted", /DELETE\s+FROM\s+venues\b/i],
  ];

  it.each(sites)("%s puts %s in the same batch as its own DELETE", (file, action, deletePattern) => {
    const source = readFileSync(join(repoRoot, file), "utf8");

    const together = batchPayloads(source).some(
      (payload) => payload.includes(action) && payload.includes("auditLogStatement") && deletePattern.test(payload),
    );

    expect(together, `${file}: "${action}" is not in the same DB.batch(...) as ${deletePattern}`).toBe(true);
  });
});

function patchRequest(env, body) {
  return onRequestPatch({
    request: new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    data: { user: { userId: 1, email: "admin@test", role: "editor" } },
  });
}

function useTransactionalBatch(env, rawDb) {
  const batch = vi.fn(async (statements) => rawDb.transaction(() => statements.map((statement) => statement.run()))());
  env.DB.batch = batch;
  return batch;
}

function makePerformanceFixture() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const event = insertEvent(rawDb, { name: "Atomic Event", slug: "atomic-event" });
  const venue = insertVenue(rawDb, { name: "Atomic Venue" });
  const performance = insertBand(rawDb, {
    name: "Atomic Band",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "18:00",
    end_time: "19:00",
  });
  return { env, rawDb, event, venue, performance };
}

describe("bulk PATCH audit atomicity", () => {
  it("rolls back the audit row when the DELETE fails", async () => {
    const { env, rawDb, performance } = makePerformanceFixture();
    rawDb.exec(`
      CREATE TRIGGER fail_bulk_delete
      BEFORE DELETE ON performances
      BEGIN
        SELECT RAISE(ABORT, 'forced bulk delete failure');
      END
    `);
    const batch = useTransactionalBatch(env, rawDb);

    const response = await patchRequest(env, { band_ids: [performance.id], action: "delete" });

    expect(response.status).toBe(500);
    expect(batch).toHaveBeenCalledOnce();
    expect(rawDb.prepare("SELECT id FROM performances WHERE id = ?").get(performance.id)).toBeTruthy();
    expect(rawDb.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'band.bulk_delete'").get().count).toBe(
      0,
    );
  });

  it("rolls back the DELETE when the audit INSERT fails", async () => {
    const { env, rawDb, performance } = makePerformanceFixture();
    rawDb.exec(`
      CREATE TRIGGER fail_bulk_audit
      BEFORE INSERT ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'forced bulk audit failure');
      END
    `);
    useTransactionalBatch(env, rawDb);

    const response = await patchRequest(env, { band_ids: [performance.id], action: "delete" });

    expect(response.status).toBe(500);
    expect(rawDb.prepare("SELECT id FROM performances WHERE id = ?").get(performance.id)).toBeTruthy();
  });

  it("reports only deleted performances in updated", async () => {
    const { env, rawDb, event, venue, performance } = makePerformanceFixture();
    const second = insertBand(rawDb, {
      name: "Second Atomic Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    useTransactionalBatch(env, rawDb);

    const response = await patchRequest(env, { band_ids: [performance.id, second.id], action: "delete" });

    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(2);
  });

  it("reports only updated performances in updated", async () => {
    const { env, rawDb, performance } = makePerformanceFixture();
    useTransactionalBatch(env, rawDb);

    const response = await patchRequest(env, {
      band_ids: [performance.id],
      action: "change_time",
      start_time: "20:00",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(1);
  });
});

describe("auditLogStatementForInsertedRow", () => {
  it("resolves resource_id by lookup and binds every other value", () => {
    const bind = vi.fn(() => ({ run: vi.fn() }));
    const env = { DB: { prepare: vi.fn(() => ({ bind })) } };

    auditLogStatementForInsertedRow(
      env,
      7,
      "api_key.created",
      "api_key",
      { table: "api_keys", matchColumn: "key_hash", matchValue: "HASH" },
      { role: "viewer" },
      "1.2.3.4",
    );

    const sql = env.DB.prepare.mock.calls[0][0];
    expect(sql).toContain("FROM api_keys WHERE key_hash = ?");
    expect(sql).toContain("SELECT ?, ?, ?, id, ?, ?");
    // The match value is bound LAST: SQLite numbers anonymous placeholders in
    // textual order, and the lookup's `?` sits after the five in the SELECT list.
    expect(bind).toHaveBeenCalledWith(
      7,
      "api_key.created",
      "api_key",
      JSON.stringify({ role: "viewer" }),
      "1.2.3.4",
      "HASH",
    );
  });

  // Table and column names cannot be bound, so they are interpolated. A caller that
  // ever passes a variable there must fail loudly rather than build the injection.
  it.each([
    ["api_keys; DROP TABLE users --", "key_hash"],
    ["api_keys", "key_hash = '' OR 1=1 --"],
    ["", "key_hash"],
    [undefined, "key_hash"],
  ])("refuses a non-identifier table=%s column=%s", (table, matchColumn) => {
    const env = { DB: { prepare: vi.fn() } };
    expect(() =>
      auditLogStatementForInsertedRow(env, 7, "a", "t", { table, matchColumn, matchValue: "x" }, null, "ip"),
    ).toThrow(/bare SQL identifiers/);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
});
