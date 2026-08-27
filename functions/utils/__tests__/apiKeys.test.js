import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDBEnv, createTestDB } from "../../api/test-utils.js";
import { toSqliteDateTime } from "../authAttempts.js";
import { generateApiKey, hashApiKey, verifyApiKey } from "../apiKeys.js";

describe("apiKeys", () => {
  let rawDb;
  let DB;

  beforeEach(() => {
    rawDb = createTestDB();
    DB = createDBEnv(rawDb);
  });

  // generateApiKey refuses a past expiry, which is correct -- creation must not
  // mint an already-dead key. A STORED key can still be expired, because time
  // passes, so that state is produced by ageing the row rather than by asking
  // the generator for something it should refuse.
  async function insertKey({ expiredBy = null, revokedAt = null, role = "viewer" } = {}) {
    const generated = await generateApiKey(new Date(Date.now() + 3_600_000));
    rawDb
      .prepare(
        "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(`Test key ${role}`, generated.keyPrefix, generated.keyHash, role, 1, generated.expiresAt, revokedAt);

    if (expiredBy !== null) {
      const past = toSqliteDateTime(new Date(Date.now() - expiredBy));
      rawDb.prepare("UPDATE api_keys SET expires_at = ? WHERE key_hash = ?").run(past, generated.keyHash);
    }
    return generated;
  }

  it("generates 256 bits of base64url entropy with the st_ prefix", async () => {
    const first = await generateApiKey();
    const second = await generateApiKey();

    expect(first.plaintext).toMatch(/^st_[A-Za-z0-9_-]{43}$/);
    expect(first.plaintext.slice(3)).toHaveLength(43);
    expect(first.plaintext).not.toBe(second.plaintext);
    expect(first.keyPrefix).toBe(first.plaintext.slice(0, 8));
    expect(first.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  // The shape assertions above are satisfied by a COUNTER -- verified: swapping
  // getRandomValues for a monotonic byte counter left the whole suite green.
  // That matters more here than a usual vacuous test, because hashing with a
  // fast SHA-256 rather than PBKDF2 is justified ONLY by the key carrying 256
  // bits of unpredictable entropy. It is the premise the design rests on and
  // the one property shape checks cannot observe, so it is asserted directly.
  it("draws its key material from getRandomValues, 32 bytes at a time", async () => {
    const source = readFileSync(new URL("../apiKeys.js", import.meta.url), "utf8");
    expect(source).toMatch(/crypto\.getRandomValues\(new Uint8Array\(KEY_BYTES\)\)/);
    expect(source).toMatch(/KEY_BYTES\s*=\s*32\b/);
    expect(source, "Math.random is not a CSPRNG").not.toMatch(/Math\.random/);

    const spy = vi.spyOn(crypto, "getRandomValues");
    const generated = await generateApiKey();

    expect(spy).toHaveBeenCalledTimes(1);
    const requested = spy.mock.calls[0][0];
    expect(requested).toBeInstanceOf(Uint8Array);
    expect(requested.byteLength).toBe(32);
    // The bytes the CSPRNG produced must be the bytes that reach the key --
    // a counter passes every check above but fails this one.
    const emitted = spy.mock.results[0].value;
    const encoded = btoa(String.fromCharCode(...emitted))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(generated.plaintext).toBe(`st_${encoded}`);
    spy.mockRestore();
  });

  it("refuses to mint a key that is already dead, unbounded, or nonsense", async () => {
    await expect(generateApiKey(new Date(Date.now() - 1000))).rejects.toThrow(/future/i);
    // Just inside and just outside the 180-day ceiling, so the bound itself is
    // pinned rather than merely "some large number is refused".
    await expect(generateApiKey(new Date(Date.now() + 179 * 24 * 60 * 60 * 1000))).resolves.toBeDefined();
    await expect(generateApiKey(new Date(Date.now() + 181 * 24 * 60 * 60 * 1000))).rejects.toThrow(/maximum/i);
    await expect(generateApiKey(new Date("nonsense"))).rejects.toThrow(/valid Date/i);
    await expect(generateApiKey("2027-01-01")).rejects.toThrow(/valid Date/i);
    // Sub-second expiry: passes the "in the future" check, then truncates to
    // the current second on the way to storage -- a key born already dead.
    //
    // The clock is pinned to a whole second because otherwise this test IS the
    // truncation it describes: run in the last 200ms of a second, now+200ms
    // crosses into the NEXT second, truncation lands in the future, and the key
    // is legitimately valid. Measured before pinning: it failed on 200 of 1000
    // millisecond offsets, so roughly one run in five.
    const wholeSecond = new Date("2026-08-26T12:00:00.000Z").getTime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(wholeSecond);
    try {
      await expect(generateApiKey(new Date(wholeSecond + 200))).rejects.toThrow(/once stored/i);
    } finally {
      clock.mockRestore();
    }
  });

  it("rejects anything that is not a plausible key, without throwing", async () => {
    for (const bad of [null, undefined, "", {}, 42, "ghp_someoneelsestoken"]) {
      await expect(verifyApiKey(DB, bad)).resolves.toBeUndefined();
    }
  });

  it("reads the role from the matched row, not from a fixed value", async () => {
    const viewer = await insertKey({ role: "viewer" });
    const admin = await insertKey({ role: "admin" });

    await expect(verifyApiKey(DB, viewer.plaintext)).resolves.toMatchObject({ role: "viewer" });
    await expect(verifyApiKey(DB, admin.plaintext)).resolves.toMatchObject({ role: "admin" });
  });

  // Known-answer vector, the same discipline the TOTP helper uses with its RFC
  // 6238 cases: a silent switch to SHA-1 or SHA-512 would still produce a
  // plausible base64url string and pass every structural check.
  it("hashes with SHA-256 and no salt, pinned by a known answer", async () => {
    await expect(hashApiKey("st_test_placeholder_not_a_real_key")).resolves.toBe(
      "F-a1MhRIhoPkoh4e8TgtxJtbMPtnX5J4FbM4pFWxkho",
    );
  });

  it("returns plaintext only from generation and stores a separate hash", async () => {
    const generated = await generateApiKey();
    const hash = await hashApiKey(generated.plaintext);

    expect(hash).not.toBe(generated.plaintext);
    expect(hash).not.toContain(generated.plaintext);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.keyHash).toBe(hash);
  });

  it("verifies a valid, unexpired, unrevoked key", async () => {
    const generated = await insertKey();

    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toMatchObject({ role: "viewer" });
  });

  it("rejects a revoked key", async () => {
    const generated = await insertKey({ revokedAt: "2026-08-26 12:00:00" });

    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toBeUndefined();
  });

  it("rejects an expired key", async () => {
    const generated = await insertKey({ expiredBy: 60_000 });

    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toBeUndefined();
  });

  // SEC-F1 is now unstorable rather than merely handled. The earlier tests here
  // aged a row and rewrote its separator to prove the parser failed closed; the
  // CHECK constraint added to migration 0060 makes that value illegal at the
  // point it would have to be written, which is the stronger guarantee. So the
  // assertion moved down a layer: the schema refuses the shape outright.
  it("refuses to store a T-separated expires_at at all", async () => {
    const generated = await insertKey();

    expect(() =>
      rawDb
        .prepare("UPDATE api_keys SET expires_at = REPLACE(expires_at, ' ', 'T') || 'Z' WHERE key_hash = ?")
        .run(generated.keyHash),
    ).toThrow(/CHECK constraint failed/i);

    expect(() =>
      rawDb.prepare("UPDATE api_keys SET expires_at = 'banana' WHERE key_hash = ?").run(generated.keyHash),
    ).toThrow(/CHECK constraint failed/i);

    // The key still verifies: the rejected writes changed nothing.
    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toBeDefined();
  });

  // SEC-F1 itself is structurally impossible here, and this is what keeps it
  // that way. The production invite-code bypass needed the comparison to happen
  // in SQL, where `expires_at > datetime('now')` is a STRING compare and "T"
  // (0x54) sorts after " " (0x20) -- so an expired value read as far-future.
  // This module parses in JS and compares timestamps instead, which cannot
  // exhibit that. Moving the check into the query to save a round-trip would
  // silently reintroduce the bypass, so the query is asserted not to mention
  // expiry at all.
  it("never filters expiry in SQL, where the T separator becomes a bypass", () => {
    // Scans every file under functions/, not just this module: part 2's list
    // endpoint is where "show only active keys" is most tempting, and it will
    // live in a file this guard would otherwise never open.
    //
    // Per file, never concatenated: joining them let an apostrophe in one
    // file's prose ("PBKDF2's") open a quoted run that swallowed SQL from
    // another. Comments are stripped for the same reason -- prose is not code.
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js") && !full.includes("__tests__")) files.push(full);
      }
    };
    walk(root);

    const sqlStrings = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
      if (!/\bapi_keys\b/.test(code)) continue;
      sqlStrings.push(...(code.match(/(["'`])(?:(?!\1)[\s\S])*\bFROM\s+api_keys\b(?:(?!\1)[\s\S])*\1/gi) || []));
    }

    expect(sqlStrings.length, "expected at least one api_keys query to inspect").toBeGreaterThan(0);
    for (const sql of sqlStrings) {
      // Selecting expires_at is fine and necessary -- the JS check needs the
      // value. What must never appear is a COMPARISON on it, or any use of
      // SQLite's datetime(), because that is where the string ordering bites.
      expect(sql, `expiry must not be compared in SQL: ${sql}`).not.toMatch(/expires_at\s*(<|>|<=|>=|=|BETWEEN)/i);
      expect(sql, `SQLite datetime() must not gate expiry: ${sql}`).not.toMatch(/datetime\s*\(/i);
    }
  });

  // The endpoints in the next part return what this resolves to. If the hash
  // rides along in that object it will eventually be serialised into a response.
  it("never returns the key hash to its caller", async () => {
    const generated = await insertKey();

    const row = await verifyApiKey(DB, generated.plaintext);

    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("key_hash");
    expect(JSON.stringify(row)).not.toContain(generated.keyHash);
  });

  it("rejects a key that does not exist without throwing", async () => {
    await expect(verifyApiKey(DB, "st_not-a-real-key")).resolves.toBeUndefined();
  });
});
