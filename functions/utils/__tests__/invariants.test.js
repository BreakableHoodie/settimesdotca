// Executable regression guards for the prod-breaking invariants documented in
// CLAUDE.md. Prose + the pre-PR review hook only catch NEW violations in a
// diff; these assertions are a deterministic, permanent guard against the
// same bug classes recurring silently.
import { describe, expect, it } from "vitest";
import { checkAuthRateLimit } from "../authAttempts.js";

// toSqliteDateTime() is exported from authAttempts.js and has its own direct
// unit tests in authAttempts.test.js (format + no-T/Z assertions). This stub
// exists for a different purpose: it captures the exact value the real
// toSqliteDateTime() produces when checkAuthRateLimit binds it into the
// rate-limit query, proving the *binding path* itself is wired correctly —
// not just that the helper's output format is right in isolation.
function createCapturingDB(queryResult = { count: 0, earliest_attempt: null }) {
  let boundArgs = null;
  const DB = {
    prepare() {
      return {
        bind(...args) {
          boundArgs = args;
          return { first: async () => queryResult };
        },
      };
    },
  };
  return { DB, getBoundArgs: () => boundArgs };
}

describe('SQLite datetime format invariant (CLAUDE.md "SQLite datetime format — do NOT use ISO 8601 T-separator")', () => {
  it("toSqliteDateTime()'s output has a space separator, no T/Z/ms — the exact SEC-F1 bug shape", async () => {
    // D1's datetime('now') returns `YYYY-MM-DD HH:MM:SS` (space separator).
    // JS's toISOString() returns `YYYY-MM-DDTHH:MM:SS.mmmZ` (T separator,
    // ms, Z suffix). A stored/compared value with a `T` silently breaks
    // string comparison against datetime('now') — this exact bug caused a
    // production invite-code expiry bypass (SEC-F1). checkAuthRateLimit's
    // scope: "ip" binding order is [ipAddress, attemptType, windowStart]
    // (see getRateLimitBindings in authAttempts.js), so windowStart —
    // produced by toSqliteDateTime() — is the 3rd bound argument.
    const { DB, getBoundArgs } = createCapturingDB();

    await checkAuthRateLimit(DB, {
      attemptType: "login",
      ipAddress: "127.0.0.1",
      scope: "ip",
    });

    const [, , windowStart] = getBoundArgs();
    expect(windowStart).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(windowStart).not.toContain("T");
  });
});
