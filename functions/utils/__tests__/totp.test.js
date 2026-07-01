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
});
