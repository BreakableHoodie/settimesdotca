// Direct tests for the PBKDF2 password hashing utility: pins the on-disk
// hash format (pbkdf2$iterations$salt$hash), the roundtrip, salt uniqueness,
// and the iteration count.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../crypto.js";

// Mirrors crypto.js's DEFAULT_ITERATIONS (not exported).
const EXPECTED_ITERATIONS = 600000;

describe("crypto.js — PBKDF2 password hashing", () => {
  it("produces the pbkdf2$iterations$salt$hash format", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1!");

    const parts = hash.split("$");
    expect(parts).toHaveLength(4);
    const [scheme, iterations, salt, digest] = parts;
    expect(scheme).toBe("pbkdf2");
    expect(Number(iterations)).toBeGreaterThan(0);
    expect(salt.length).toBeGreaterThan(0);
    expect(digest.length).toBeGreaterThan(0);
  });

  it("uses the documented iteration count", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1!");
    const [, iterations] = hash.split("$");
    expect(Number(iterations)).toBe(EXPECTED_ITERATIONS);
  });

  it("round-trips: a hash verifies against the password that produced it", async () => {
    const password = "CorrectHorseBatteryStaple1!";
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("round-trips: verification fails for the wrong password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1!");

    expect(await verifyPassword("WrongPassword1!", hash)).toBe(false);
  });

  it("salts are unique: hashing the same password twice yields different hashes", async () => {
    const password = "CorrectHorseBatteryStaple1!";
    const hashA = await hashPassword(password);
    const hashB = await hashPassword(password);

    expect(hashA).not.toBe(hashB);

    const [, , saltA] = hashA.split("$");
    const [, , saltB] = hashB.split("$");
    expect(saltA).not.toBe(saltB);

    // Both must still independently verify — different salts, same password.
    expect(await verifyPassword(password, hashA)).toBe(true);
    expect(await verifyPassword(password, hashB)).toBe(true);
  });

  it("still verifies a legacy pbkdf2$ hash produced at 100,000 iterations (pre-bump default)", async () => {
    // Simulates a password hashed by an older build of this module, before
    // DEFAULT_ITERATIONS was raised from 100,000 to 600,000. verifyPassword
    // must read the iteration count from the hash string itself, not assume
    // the current default, so previously-issued hashes keep verifying
    // without a rehash migration.
    const password = "CorrectHorseBatteryStaple1!";
    const LEGACY_HASH_ITERATIONS = 100000;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: LEGACY_HASH_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      32 * 8,
    );
    const saltBase64 = btoa(String.fromCharCode(...salt));
    const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(derived)));
    const legacyHash = `pbkdf2$${LEGACY_HASH_ITERATIONS}$${saltBase64}$${hashBase64}`;

    expect(await verifyPassword(password, legacyHash)).toBe(true);
    expect(await verifyPassword("WrongPassword1!", legacyHash)).toBe(false);
  });

  // verifyPassword is a try/catch-wrapped security boundary that must never
  // throw on attacker- or corruption-supplied input — it should reject
  // malformed hashes exactly like a mismatched password, not blow up the
  // caller (login.js/mfa flows call this directly against the stored column).
  describe("malformed stored hashes", () => {
    it("returns false for a hash with the wrong number of pbkdf2$ segments", async () => {
      expect(await verifyPassword("anything", "pbkdf2$600000$onlysalt")).toBe(false);
    });

    it("returns false for a pbkdf2$ hash with a non-numeric iteration count", async () => {
      expect(await verifyPassword("anything", "pbkdf2$notanumber$c2FsdA==$aGFzaA==")).toBe(false);
    });

    it("returns false for a pbkdf2$ hash with an empty salt or digest segment", async () => {
      expect(await verifyPassword("anything", "pbkdf2$600000$$aGFzaA==")).toBe(false);
      expect(await verifyPassword("anything", "pbkdf2$600000$c2FsdA==$")).toBe(false);
    });

    it("returns false for a completely unrecognized (non-legacy, non-pbkdf2$) string", async () => {
      expect(await verifyPassword("anything", "not-a-valid-hash-at-all")).toBe(false);
    });

    it("returns false rather than throwing for garbage base64 in either segment", async () => {
      // atob() throws on invalid base64 — verifyPassword's try/catch must
      // swallow that and return false, not propagate an exception to the
      // caller.
      await expect(verifyPassword("anything", "pbkdf2$600000$not-base64!!!$also-not-base64!!!")).resolves.toBe(false);
    });
  });
});
