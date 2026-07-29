// Direct tests for the PBKDF2 password hashing utility (#673). Previously
// only exercised transitively via login.test.js/mfa.test.js — this pins the
// on-disk hash format, the roundtrip, salt uniqueness, and the iteration
// count CLAUDE.md documents ("PBKDF2, not bcrypt": format is
// pbkdf2$iterations$salt$hash) so a future refactor can't silently weaken it.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../crypto.js";

// Mirrors crypto.js's DEFAULT_ITERATIONS (not exported) and the value CLAUDE.md
// documents under "PBKDF2, not bcrypt". If this module's iteration count ever
// changes, this constant — and the security review that should accompany a
// deliberate change — must be updated together.
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
