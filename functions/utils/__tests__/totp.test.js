import { describe, expect, it } from "vitest";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  base32Encode,
} from "../totp.js";

describe("totp utilities", () => {
  it("generates a valid base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("generates a code that verifies", async () => {
    const secret = generateTotpSecret();
    const code = await generateTotpCode(secret);
    const valid = await verifyTotp(secret, code);
    expect(valid).toBe(true);
  });

  // RFC 6238 Appendix B test vectors (SHA-1). The reference values are 8-digit;
  // the 6-digit codes are the last 6 (value % 1e6). The RFC secret is ASCII
  // "12345678901234567890"; we derive its base32 at runtime rather than commit the
  // base32 literal, so secret scanners don't flag a public test vector as a
  // credential. Passing these proves the implementation computes the same codes a
  // real authenticator app (Google Authenticator, Authy) would — i.e. it is
  // RFC-correct, not merely self-consistent.
  it("matches RFC 6238 test vectors", async () => {
    const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));
    expect(await generateTotpCode(RFC_SECRET, 59 * 1000)).toBe("287082");
    expect(await generateTotpCode(RFC_SECRET, 1111111109 * 1000)).toBe("081804");
    expect(await generateTotpCode(RFC_SECRET, 1234567890 * 1000)).toBe("005924");
  });

  it("verifies and consumes backup codes", async () => {
    const codes = generateBackupCodes(2);
    const hashed = await Promise.all(codes.map((code) => hashBackupCode(code)));
    const result = await verifyBackupCode(codes[0], hashed);
    expect(result.valid).toBe(true);
    expect(result.remaining).toHaveLength(1);
  });

  // #673: negative cases. The RFC vectors above prove correctness on a valid
  // code; without these, an implementation that returns `true`
  // unconditionally would pass nearly this whole file.
  describe("negative cases (#673)", () => {
    it("verifyTotp returns false for a wrong code", async () => {
      const secret = generateTotpSecret();
      const correctCode = await generateTotpCode(secret);
      // Flip the first digit so the wrong code is guaranteed to differ from
      // the real one (avoids a 1-in-10 flake from picking an arbitrary digit).
      const firstDigit = Number(correctCode[0]);
      const wrongCode = `${(firstDigit + 1) % 10}${correctCode.slice(1)}`;

      expect(await verifyTotp(secret, wrongCode)).toBe(false);
    });

    it("verifyTotp returns false for a code outside the time window", async () => {
      const secret = generateTotpSecret();
      // 10 minutes away from "now" is well outside the default ±1 step
      // (±30s) window, so this code must not validate against the current
      // time that verifyTotp checks internally.
      const farFutureCode = await generateTotpCode(secret, Date.now() + 10 * 60 * 1000);

      expect(await verifyTotp(secret, farFutureCode)).toBe(false);
    });

    it("verifyTotp returns false for an empty/missing code", async () => {
      const secret = generateTotpSecret();

      expect(await verifyTotp(secret, "")).toBe(false);
      expect(await verifyTotp(secret, null)).toBe(false);
    });

    it("verifyBackupCode returns false for an invalid code", async () => {
      const codes = generateBackupCodes(2);
      const hashed = await Promise.all(codes.map((code) => hashBackupCode(code)));

      const result = await verifyBackupCode("0000-0000", hashed);

      expect(result.valid).toBe(false);
      // An invalid attempt must not consume anything from the set.
      expect(result.remaining).toHaveLength(2);
    });

    it("verifyBackupCode returns false for an already-consumed code", async () => {
      const codes = generateBackupCodes(2);
      const hashed = await Promise.all(codes.map((code) => hashBackupCode(code)));

      // First use succeeds and the caller persists the trimmed `remaining`
      // list back to storage (the real usage pattern — see mfa verify flows).
      const firstAttempt = await verifyBackupCode(codes[0], hashed);
      expect(firstAttempt.valid).toBe(true);

      // Re-using the same code against the now-trimmed list must fail: the
      // code has already been consumed and removed from the persisted set.
      const secondAttempt = await verifyBackupCode(codes[0], firstAttempt.remaining);
      expect(secondAttempt.valid).toBe(false);
    });
  });
});
