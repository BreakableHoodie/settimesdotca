import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createDBEnv, createTestDB } from "../../api/test-utils.js";
import { generateApiKey, hashApiKey, verifyApiKey } from "../apiKeys.js";

describe("apiKeys", () => {
  let rawDb;
  let DB;

  beforeEach(() => {
    rawDb = createTestDB();
    DB = createDBEnv(rawDb);
  });

  async function insertKey({ expiresAt, revokedAt = null } = {}) {
    const generated = await generateApiKey(expiresAt ?? new Date(Date.now() + 60_000));
    rawDb
      .prepare(
        "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("Test key", generated.keyPrefix, generated.keyHash, "viewer", 1, generated.expiresAt, revokedAt);
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
    const generated = await insertKey({ expiresAt: new Date(Date.now() - 60_000) });

    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toBeUndefined();
  });

  // The original test here stored a key that was ALREADY expired and then
  // rewrote its separator -- which passes whether or not the T form is handled,
  // because a past date is rejected either way. Verified by mutation: breaking
  // the T branch of fromSqliteDateTime left all seven tests green.
  //
  // The direction that actually distinguishes the implementations is a FUTURE
  // expiry stored with a T. If the parser mishandles it the value becomes an
  // Invalid Date, the key is rejected, and a live integration dies for no
  // stated reason.
  it("accepts a still-valid key whose expires_at carries the legacy T separator", async () => {
    const generated = await insertKey({ expiresAt: new Date(Date.now() + 3_600_000) });
    rawDb
      .prepare("UPDATE api_keys SET expires_at = REPLACE(expires_at, ' ', 'T') || 'Z' WHERE key_hash = ?")
      .run(generated.keyHash);

    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toBeDefined();
  });

  it("rejects an expired key whose expires_at carries the legacy T separator", async () => {
    const generated = await insertKey({ expiresAt: new Date(Date.now() - 60_000) });
    rawDb
      .prepare("UPDATE api_keys SET expires_at = REPLACE(expires_at, ' ', 'T') || 'Z' WHERE key_hash = ?")
      .run(generated.keyHash);

    await expect(verifyApiKey(DB, generated.plaintext)).resolves.toBeUndefined();
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
    const source = readFileSync(new URL("../apiKeys.js", import.meta.url), "utf8");
    // Matches double-quoted, single-quoted and template-literal SQL. The
    // length assertion below is what stops this going vacuous: if the query is
    // reshaped into a form this does not match, the guard fails loudly instead
    // of silently inspecting nothing.
    const sqlStrings = source.match(/(["'`])(?:(?!\1)[\s\S])*\bFROM\s+api_keys\b(?:(?!\1)[\s\S])*\1/gi) || [];

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
