// Direct tests for the PBKDF2 password hashing utility: pins the on-disk
// hash format (pbkdf2$iterations$salt$hash), the roundtrip, salt uniqueness,
// and the iteration count.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ITERATIONS, WORKERS_PBKDF2_MAX_ITERATIONS, hashPassword, verifyPassword } from "../crypto.js";

// The production Workers runtime's exact refusal, measured on the live edge
// 2026-10-10. Node and local workerd do NOT enforce it, which is the whole
// reason this file has to emulate it.
const WORKERS_CAP = 100000;
const WORKERS_CAP_ERROR = (n) =>
  Object.assign(new Error(`Pbkdf2 failed: iteration counts above 100000 are not supported (requested ${n}).`), {
    name: "NotSupportedError",
  });

// ONE stub, used by every test below, so the self-check proves the very
// emulation the guard tests rely on (two copies could drift apart and let a
// guard pass vacuously). Returns the spy.
function emulateWorkersCap() {
  const realDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
  return vi.spyOn(crypto.subtle, "deriveBits").mockImplementation(async (params, key, length) => {
    if (params?.name === "PBKDF2" && params.iterations > WORKERS_CAP) {
      throw WORKERS_CAP_ERROR(params.iterations);
    }
    return realDeriveBits(params, key, length);
  });
}

describe("crypto.js — the production Workers PBKDF2 cap", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pins the cap to the value production enforces", () => {
    expect(WORKERS_PBKDF2_MAX_ITERATIONS).toBe(WORKERS_CAP);
    expect(DEFAULT_ITERATIONS).toBeLessThanOrEqual(WORKERS_CAP);
  });

  // The guard that would have caught #426. Raising DEFAULT_ITERATIONS above
  // the cap makes hashPassword throw here exactly as it threw in production.
  it("hashPassword succeeds under a runtime that refuses > 100,000 iterations", async () => {
    emulateWorkersCap();

    const password = "CorrectHorseBatteryStaple1!";
    const hash = await hashPassword(password);
    expect(Number(hash.split("$")[1])).toBe(DEFAULT_ITERATIONS);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  // The emulation above is only worth trusting if it really refuses: prove
  // the stub throws for an over-cap request rather than silently passing.
  it("the emulated runtime really refuses an over-cap request", async () => {
    emulateWorkersCap();
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode("x"), "PBKDF2", false, ["deriveBits"]);
    await expect(
      crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new Uint8Array(16), iterations: 600000, hash: "SHA-256" },
        km,
        256,
      ),
    ).rejects.toThrow(/iteration counts above 100000 are not supported/);
  });

  // A stored over-cap hash must be refused BEFORE deriving. The assertion that
  // earns this test is that deriveBits is never called: returning false alone
  // also happens when the edge throws and the catch swallows it, which is the
  // misleading "wrong password" path this guard replaces.
  it("verifyPassword refuses a stored over-cap hash without deriving", async () => {
    const spy = emulateWorkersCap();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await verifyPassword("anything", "pbkdf2$600000$c2FsdA==$aGFzaA==")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/above the Workers cap/));
  });

  // A literal iteration count elsewhere is how login.js kept asking for
  // 600,000 after crypto.js was the only place meant to decide. Scan for any
  // over-cap literal in functions/ outside tests.
  it("no non-test file under functions/ hard-codes an over-cap iteration count", () => {
    const root = join(__dirname, "..", "..");
    const ITER_CONTEXT = /iteration/i;
    const overCap = (line) =>
      (line.match(/\b\d[\d_]{5,}\b/g) || []).some((n) => Number(n.replace(/_/g, "")) > WORKERS_CAP);
    const OVER_CAP = { test: overCap };
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(p);
        } else if (p.endsWith(".js")) {
          readFileSync(p, "utf8")
            .split("\n")
            .forEach((line, i) => {
              if (ITER_CONTEXT.test(line) && OVER_CAP.test(line) && !line.trim().startsWith("//")) {
                offenders.push(`${relative(root, p)}:${i + 1}: ${line.trim()}`);
              }
            });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
    // Self-check: the scan's patterns still recognise the shape that shipped.
    expect(ITER_CONTEXT.test("storedIterations < 600000") && OVER_CAP.test("storedIterations < 600000")).toBe(true);
    expect(OVER_CAP.test("iterations = 100000")).toBe(false);
  });
});

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

  it("uses the documented iteration count (the Workers cap, 100,000)", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1!");
    const [, iterations] = hash.split("$");
    expect(Number(iterations)).toBe(100000);
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
