import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";
import { apiKeyRateLimitKey, checkRateLimitByKey } from "../rateLimit.js";

const functionsDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * D1 accepts numbered placeholders (`?1`, `?2`); better-sqlite3, which backs the whole
 * unit-test harness, treats them as NAMED parameters and refuses to bind them
 * positionally at all. The failure is not loud: `checkRateLimitByKey` catches it and
 * fails closed, so a route silently returns 429 in tests while behaving correctly in
 * production -- or worse, a test asserts the 429 and enshrines it.
 *
 * That is exactly what had happened. The limiter's SQL used `?1/?2/?3`, so its success
 * path had never executed under test even though the module is on several hot paths.
 * Discovered only because a new caller's tests all came back 429.
 */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

describe("SQL placeholders under the better-sqlite3 harness", () => {
  it("no file in functions/ uses numbered ?N placeholders", () => {
    const offenders = sourceFiles(functionsDir).filter((file) => {
      const source = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
      return /\?\d+\s*(,|\)|\s|$)/m.test(source) && /(prepare|exec)\s*\(/.test(source);
    });

    expect(offenders.map((f) => f.replace(functionsDir, "functions/utils/.."))).toEqual([]);
  });

  it("counts a real request rather than falling into the fail-closed catch", async () => {
    const { env } = createTestEnv({ role: "admin" });
    const config = { requests: 3, window: 60 };
    const key = apiKeyRateLimitKey(42, "/api/admin/api-keys");

    const first = await checkRateLimitByKey(env.DB, key, config);
    // remaining === 2 proves the upsert actually ran and RETURNING came back with
    // count === 1. The fail-closed branch returns remaining 0, which is what this
    // test caught the first time.
    expect(first).toMatchObject({ allowed: true, remaining: 2, limit: 3 });

    await checkRateLimitByKey(env.DB, key, config);
    await checkRateLimitByKey(env.DB, key, config);
    const overLimit = await checkRateLimitByKey(env.DB, key, config);

    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
  });

  it("scopes the counter per key and per base path", async () => {
    const { env } = createTestEnv({ role: "admin" });
    const config = { requests: 1, window: 60 };

    await checkRateLimitByKey(env.DB, apiKeyRateLimitKey(1, "/api/admin/api-keys"), config);
    const otherKey = await checkRateLimitByKey(env.DB, apiKeyRateLimitKey(2, "/api/admin/api-keys"), config);
    const otherPath = await checkRateLimitByKey(env.DB, apiKeyRateLimitKey(1, "/api/admin/venues"), config);

    expect(otherKey.allowed).toBe(true);
    expect(otherPath.allowed).toBe(true);
  });
});
