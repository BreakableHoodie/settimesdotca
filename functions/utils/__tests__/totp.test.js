import { describe, expect, it } from "vitest";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
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

  it("verifies and consumes backup codes", async () => {
    const codes = generateBackupCodes(2);
    const hashed = await Promise.all(codes.map(code => hashBackupCode(code)));
    const result = await verifyBackupCode(codes[0], hashed);
    expect(result.valid).toBe(true);
    expect(result.remaining).toHaveLength(1);
  });
});
