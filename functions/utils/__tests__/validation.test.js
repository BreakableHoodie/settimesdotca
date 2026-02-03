// Tests for validation utilities
import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  validatePassword,
  validateRequiredFields,
  isValidUUID,
  isValidRole,
  isValidISODate,
  isValidPostalCode,
  normalizePostalCode,
} from "../validation.js";

describe("Email Validation", () => {
  it("should validate correct email formats", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user+tag@domain.co.uk")).toBe(true);
    expect(isValidEmail("admin@localhost.dev")).toBe(true);
  });

  it("should reject invalid email formats", () => {
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it("should handle emails with whitespace", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
});

describe("Password Validation", () => {
  it("should validate password length", () => {
    const result1 = validatePassword("short");
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContain("Password must be at least 12 characters");

    const result2 = validatePassword("LongEnough12!");
    expect(result2.valid).toBe(true);
    expect(result2.errors).toHaveLength(0);
  });

  it("should enforce uppercase requirement when set", () => {
    const result = validatePassword("lowercase123", { requireUppercase: true });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Password must contain at least one uppercase letter",
    );

    const result2 = validatePassword("Uppercase123", { requireUppercase: true });
    expect(result2.valid).toBe(true);
  });

  it("should handle null/undefined passwords", () => {
    const result1 = validatePassword(null);
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContain("Password is required");

    const result2 = validatePassword(undefined);
    expect(result2.valid).toBe(false);
  });
});

describe("Required Fields Validation", () => {
  it("should validate all required fields are present", () => {
    const data = { name: "John", email: "john@example.com" };
    const result = validateRequiredFields(data, ["name", "email"]);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("should detect missing fields", () => {
    const data = { name: "John" };
    const result = validateRequiredFields(data, ["name", "email", "password"]);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["email", "password"]);
  });
});

describe("UUID Validation", () => {
  it("should validate correct UUID formats", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("should reject invalid UUID formats", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("123")).toBe(false);
    expect(isValidUUID("")).toBe(false);
  });
});

describe("Role Validation", () => {
  it("should validate correct roles", () => {
    expect(isValidRole("admin")).toBe(true);
    expect(isValidRole("editor")).toBe(true);
    expect(isValidRole("viewer")).toBe(true);
  });

  it("should reject invalid roles", () => {
    expect(isValidRole("superuser")).toBe(false);
    expect(isValidRole("")).toBe(false);
  });
});

describe("ISO Date Validation", () => {
  it("should validate correct ISO date strings", () => {
    expect(isValidISODate("2025-11-18T14:00:00Z")).toBe(true);
    expect(isValidISODate("2025-11-18")).toBe(true);
    expect(isValidISODate(new Date().toISOString())).toBe(true);
    expect(isValidISODate("2025-11-18T14:00:00.123Z")).toBe(true);
    expect(isValidISODate("2025-11-18T14:00:00+00:00")).toBe(true);
  });

  it("should reject invalid date strings", () => {
    expect(isValidISODate("not a date")).toBe(false);
    expect(isValidISODate("2025-13-45")).toBe(false);
    expect(isValidISODate("")).toBe(false);
    expect(isValidISODate(null)).toBe(false);
  });

  it("should reject non-ISO formats", () => {
    // These are valid dates but not ISO format
    expect(isValidISODate("1/1/2023")).toBe(false);
    expect(isValidISODate("Jan 1, 2023")).toBe(false);
    expect(isValidISODate("2023/01/01")).toBe(false);
  });
});

describe("Postal Code Validation", () => {
  it("should validate correct Canadian postal codes", () => {
    expect(isValidPostalCode("M5V 2H1")).toBe(true);
    expect(isValidPostalCode("K8N 5W6")).toBe(true);
    expect(isValidPostalCode("V6B 3P8")).toBe(true);
  });

  it("should validate correct US ZIP codes", () => {
    expect(isValidPostalCode("90210")).toBe(true);
    expect(isValidPostalCode("10001")).toBe(true);
    expect(isValidPostalCode("12345-6789")).toBe(true);
  });

  it("should handle formatting flexibly (fix/band-profile-text-wrapping)", () => {
    expect(isValidPostalCode("M5V2H1")).toBe(true); // No space
    expect(isValidPostalCode("M5V  2H1")).toBe(true); // Extra space
    expect(isValidPostalCode("M5V\u00A02H1")).toBe(true); // Non-breaking space
    expect(isValidPostalCode(" m5v 2h1 ")).toBe(true); // Lowercase and trimming
  });

  it("should reject invalid postal codes", () => {
    expect(isValidPostalCode("1234")).toBe(false); // Too short
    expect(isValidPostalCode("1234er")).toBe(false);
    expect(isValidPostalCode("ABC DEF")).toBe(false); // Invalid format
    expect(isValidPostalCode("M5V 2H")).toBe(false); // Incomplete
    expect(isValidPostalCode("")).toBe(true); // Optional field (returns true if empty/null based on implementation)
    expect(isValidPostalCode(null)).toBe(true);
  });
});

describe("Postal Code Normalization", () => {
  it("should normalize Canadian postal codes", () => {
    expect(normalizePostalCode("m5v2h1")).toBe("M5V 2H1");
    expect(normalizePostalCode("k8n 5w6")).toBe("K8N 5W6");
    expect(normalizePostalCode("  v6b  3p8  ")).toBe("V6B 3P8");
    expect(normalizePostalCode("M5V\u00A02H1")).toBe("M5V 2H1");
  });

  it("should preserve valid US ZIP codes", () => {
    expect(normalizePostalCode("90210")).toBe("90210");
    expect(normalizePostalCode("12345-6789")).toBe("12345-6789");
  });

  it("should handle mixed case", () => {
    expect(normalizePostalCode("m5v 2h1")).toBe("M5V 2H1");
    expect(normalizePostalCode("M5v 2H1")).toBe("M5V 2H1");
  });

  it("should handle null/empty inputs", () => {
    expect(normalizePostalCode("")).toBe(null);
    expect(normalizePostalCode(null)).toBe(null);
    expect(normalizePostalCode("   ")).toBe(null);
  });
});
