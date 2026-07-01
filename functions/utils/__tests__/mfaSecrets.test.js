import { describe, expect, it } from "vitest";

import { decryptTotpSecret, encryptTotpSecret, isEncryptedTotpSecret, loadTotpSecret } from "../mfaSecrets.js";

describe("mfaSecrets", () => {
  it("encrypts and decrypts TOTP secrets with a configured key", async () => {
    const env = { MFA_TOTP_ENCRYPTION_KEY: "unit-test-mfa-key", ENVIRONMENT: "test" };

    const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP", env);

    expect(isEncryptedTotpSecret(encrypted)).toBe(true);
    expect(encrypted).not.toBe("JBSWY3DPEHPK3PXP");
    await expect(decryptTotpSecret(encrypted, env)).resolves.toBe("JBSWY3DPEHPK3PXP");
  });

  it("keeps legacy plaintext secrets readable for backward compatibility", async () => {
    await expect(decryptTotpSecret("JBSWY3DPEHPK3PXP", { ENVIRONMENT: "production" })).resolves.toBe(
      "JBSWY3DPEHPK3PXP",
    );
  });

  it("requires an encryption key to decrypt encrypted secrets in production", async () => {
    const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP", {
      MFA_TOTP_ENCRYPTION_KEY: "unit-test-mfa-key",
      ENVIRONMENT: "production",
    });

    await expect(decryptTotpSecret(encrypted, { ENVIRONMENT: "production" })).rejects.toThrow(
      "MFA_TOTP_ENCRYPTION_KEY environment variable is required",
    );
  });

  it("prepares legacy plaintext secrets for migration when a key is configured", async () => {
    const result = await loadTotpSecret("JBSWY3DPEHPK3PXP", {
      MFA_TOTP_ENCRYPTION_KEY: "unit-test-mfa-key",
      ENVIRONMENT: "development",
    });

    expect(result.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(result.shouldPersist).toBe(true);
    expect(isEncryptedTotpSecret(result.encryptedSecret)).toBe(true);
  });

  it("leaves legacy plaintext secrets readable until a real key is configured", async () => {
    const result = await loadTotpSecret("JBSWY3DPEHPK3PXP", {
      ENVIRONMENT: "development",
    });

    expect(result).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      encryptedSecret: null,
      shouldPersist: false,
    });
  });
});
