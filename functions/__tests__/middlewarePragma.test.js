// Executable guard for the "PRAGMA foreign_keys = ON is enforced in
// production" invariant in CLAUDE.md: a strict read-only allowlist (only
// GET/HEAD skip the PRAGMA) that must never be widened to skip writes.
import { describe, expect, test } from "vitest";
import { onRequest } from "../_middleware.js";

const NEUTRAL_URL = "https://example.test/api/venues"; // neutral path, not /api/metrics
const LOOPBACK_HEADERS = { "CF-Connecting-IP": "127.0.0.1" };

const PRAGMA = "PRAGMA foreign_keys = ON";

/**
 * A minimal D1-shaped env.DB that records statements at EXECUTION time.
 *
 * Recording in `prepare()` would prove only that the statement was built, not
 * that it ran — a regression that prepared the PRAGMA and never called `run()`
 * would leave FK enforcement off while still passing. `_middleware.js` calls
 * `.prepare(...).run()`, so `run()` is the only point that proves execution.
 *
 * The push happens after an `await`, not synchronously at invocation — this
 * distinguishes "run() was called" from "run() completed", so the ordering
 * assertion below proves the PRAGMA finished before `next()`, not merely that
 * it started.
 */
function dbWithPragmaSpy() {
  const executed = [];
  const DB = {
    prepare(sql) {
      return {
        async run() {
          await Promise.resolve();
          executed.push(sql);
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };
  return { DB, executed };
}

/**
 * `next()` stub that snapshots whether the PRAGMA had already executed at the
 * moment the handler was invoked. Order matters: the PRAGMA must be ON *before*
 * the handler writes, so asserting only that it ran at some point would still
 * pass if it were moved after `context.next()` — which would leave every
 * handler write unprotected.
 */
function okNext(executed = [], seen = {}) {
  return async () => {
    seen.pragmaRanBeforeNext = executed.includes(PRAGMA);
    seen.called = true;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("_middleware.js — PRAGMA foreign_keys allowlist (#673)", () => {
  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s enables PRAGMA foreign_keys = ON before the handler runs",
    async (method) => {
      const { DB, executed } = dbWithPragmaSpy();
      const seen = {};
      const request = new Request(NEUTRAL_URL, { method, headers: LOOPBACK_HEADERS });

      const response = await onRequest({ request, env: { DB }, data: {}, next: okNext(executed, seen) });

      expect(response.status).toBe(200);
      expect(executed).toContain(PRAGMA);
      // Ordering is the point: ON *before* the handler runs, not merely at some
      // point during the request.
      expect(seen.pragmaRanBeforeNext).toBe(true);
    },
  );

  test.each(["GET", "HEAD"])(
    "%s reaches the method guard and is skipped by it (read-only allowlist)",
    async (method) => {
      // This asserts the guard's POLICY, not a property of HTTP: the middleware
      // treats GET/HEAD as read-only and skips the PRAGMA round-trip to keep hot
      // read paths fast. A handler could in principle still write on a GET — the
      // allowlist is a deliberate performance trade-off, not a guarantee that
      // these methods cannot mutate.
      const { DB, executed } = dbWithPragmaSpy();
      const request = new Request(NEUTRAL_URL, { method, headers: LOOPBACK_HEADERS });

      const response = await onRequest({ request, env: { DB }, data: {}, next: okNext(executed) });

      expect(response.status).toBe(200);
      expect(executed).not.toContain(PRAGMA);
      expect(executed).toHaveLength(0);
    },
  );

  test("an unrecognized/custom method that reaches the guard still gets the PRAGMA", async () => {
    // Of the methods that REACH the guard, it is an allowlist: only GET/HEAD are
    // skipped, so anything else — including a method that is neither a known
    // mutator nor explicitly listed — gets FK enforcement. Regressing this to a
    // denylist (skip all but known mutators) would silently disable FK checks for
    // any new method. Note this scope is "reaches the guard": OPTIONS is handled
    // earlier and never gets here — see the OPTIONS test below.
    const { DB, executed } = dbWithPragmaSpy();
    const seen = {};
    const request = new Request(NEUTRAL_URL, { method: "REPORT", headers: LOOPBACK_HEADERS });

    await onRequest({ request, env: { DB }, data: {}, next: okNext(executed, seen) });

    expect(executed).toContain(PRAGMA);
    expect(seen.pragmaRanBeforeNext).toBe(true);
  });

  test("OPTIONS short-circuits as a CORS preflight before reaching the guard, so no PRAGMA", async () => {
    // `_middleware.js` returns the preflight response early (the `request.method
    // === "OPTIONS"` branch) well before the PRAGMA guard. That is intentional: a
    // preflight never touches the database, so there is nothing to protect. This
    // documents the one non-GET/HEAD method that legitimately runs no PRAGMA, so
    // the allowlist test above is not read as an absolute rule.
    const { DB, executed } = dbWithPragmaSpy();
    const seen = {};
    const request = new Request(NEUTRAL_URL, { method: "OPTIONS", headers: LOOPBACK_HEADERS });

    const response = await onRequest({ request, env: { DB }, data: {}, next: okNext(executed, seen) });

    expect(response.status).toBe(204);
    expect(executed).not.toContain(PRAGMA);
    // Short-circuited: the downstream handler is never invoked.
    expect(seen.called).toBeUndefined();
  });

  test("no env.DB (e.g. a binding-less test env) does not throw for a mutating method", async () => {
    const request = new Request(NEUTRAL_URL, { method: "POST", headers: LOOPBACK_HEADERS });

    const response = await onRequest({ request, env: {}, data: {}, next: okNext() });

    expect(response.status).toBe(200);
  });
});
