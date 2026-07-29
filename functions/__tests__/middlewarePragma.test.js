// Tests for the PRAGMA foreign_keys allowlist in functions/_middleware.js
// (#673). CLAUDE.md's "PRAGMA foreign_keys = ON is enforced in production"
// section says the guard is "a strict read-only allowlist... never widen it
// to skip writes" — this file is the executable guard for that invariant:
// nothing previously asserted the PRAGMA actually fires for every mutating
// method, or that GET/HEAD are (deliberately) skipped.
import { describe, expect, test } from "vitest";
import { onRequest } from "../_middleware.js";

const NEUTRAL_URL = "https://example.test/api/venues"; // neutral path, not /api/metrics
const LOOPBACK_HEADERS = { "CF-Connecting-IP": "127.0.0.1" };

/** A minimal D1-shaped env.DB that records every PRAGMA/SQL statement it's asked to run. */
function dbWithPragmaSpy() {
  const preparedStatements = [];
  const DB = {
    prepare(sql) {
      preparedStatements.push(sql);
      return {
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };
  return { DB, preparedStatements };
}

function okNext() {
  return async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

describe("_middleware.js — PRAGMA foreign_keys allowlist (#673)", () => {
  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s enables PRAGMA foreign_keys = ON before the handler runs",
    async (method) => {
      const { DB, preparedStatements } = dbWithPragmaSpy();
      const request = new Request(NEUTRAL_URL, { method, headers: LOOPBACK_HEADERS });

      const response = await onRequest({ request, env: { DB }, data: {}, next: okNext() });

      expect(response.status).toBe(200);
      expect(preparedStatements).toContain("PRAGMA foreign_keys = ON");
    },
  );

  test.each(["GET", "HEAD"])(
    "%s does NOT run the PRAGMA — read-only requests can't violate FK constraints",
    async (method) => {
      const { DB, preparedStatements } = dbWithPragmaSpy();
      const request = new Request(NEUTRAL_URL, { method, headers: LOOPBACK_HEADERS });

      const response = await onRequest({ request, env: { DB }, data: {}, next: okNext() });

      expect(response.status).toBe(200);
      expect(preparedStatements).not.toContain("PRAGMA foreign_keys = ON");
      expect(preparedStatements).toHaveLength(0);
    },
  );

  test("an unrecognized/custom method still gets the PRAGMA (allowlist, not a denylist)", async () => {
    // The guard is `isReadOnlyMethod = GET || HEAD`; everything else — including
    // a method neither explicitly listed as read-only nor as a known mutator —
    // must still get FK enforcement. Regressing this to a denylist (skip only
    // known-safe mutators) would silently disable FK checks for anything new.
    const { DB, preparedStatements } = dbWithPragmaSpy();
    const request = new Request(NEUTRAL_URL, { method: "REPORT", headers: LOOPBACK_HEADERS });

    await onRequest({ request, env: { DB }, data: {}, next: okNext() });

    expect(preparedStatements).toContain("PRAGMA foreign_keys = ON");
  });

  test("no env.DB (e.g. a binding-less test env) does not throw for a mutating method", async () => {
    const request = new Request(NEUTRAL_URL, { method: "POST", headers: LOOPBACK_HEADERS });

    const response = await onRequest({ request, env: {}, data: {}, next: okNext() });

    expect(response.status).toBe(200);
  });
});
