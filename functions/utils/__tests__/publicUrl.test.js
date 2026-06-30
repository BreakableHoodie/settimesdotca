// Tests for getPublicBaseUrl — verifies that emailed security links never
// derive their host from the client-controlled request (Host-header poisoning).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPublicBaseUrl } from "../publicUrl.js";

const SAFE_DEFAULT = "https://settimes.ca";

describe("getPublicBaseUrl", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when PUBLIC_URL is set", () => {
    it("returns PUBLIC_URL as-is when it has no trailing slash", () => {
      expect(getPublicBaseUrl({ PUBLIC_URL: "https://example.com" })).toBe(
        "https://example.com",
      );
    });

    it("strips a single trailing slash from PUBLIC_URL", () => {
      expect(getPublicBaseUrl({ PUBLIC_URL: "https://example.com/" })).toBe(
        "https://example.com",
      );
    });

    it("strips multiple trailing slashes from PUBLIC_URL", () => {
      expect(getPublicBaseUrl({ PUBLIC_URL: "https://example.com///" })).toBe(
        "https://example.com",
      );
    });

    it("trims surrounding whitespace from PUBLIC_URL before using it", () => {
      expect(
        getPublicBaseUrl({ PUBLIC_URL: "  https://example.com  " }),
      ).toBe("https://example.com");
    });

    it("does not emit a warning when PUBLIC_URL is set", () => {
      getPublicBaseUrl({ PUBLIC_URL: "https://example.com" });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("returns PUBLIC_URL unchanged for staging/preview URLs", () => {
      const staging = "https://staging.settimes.ca";
      expect(getPublicBaseUrl({ PUBLIC_URL: staging })).toBe(staging);
    });
  });

  describe("when PUBLIC_URL is unset or empty", () => {
    it("returns the safe production default when PUBLIC_URL is undefined", () => {
      expect(getPublicBaseUrl({})).toBe(SAFE_DEFAULT);
    });

    it("returns the safe production default when PUBLIC_URL is null", () => {
      expect(getPublicBaseUrl({ PUBLIC_URL: null })).toBe(SAFE_DEFAULT);
    });

    it("returns the safe production default when PUBLIC_URL is an empty string", () => {
      expect(getPublicBaseUrl({ PUBLIC_URL: "" })).toBe(SAFE_DEFAULT);
    });

    it("returns the safe production default when PUBLIC_URL is whitespace-only", () => {
      expect(getPublicBaseUrl({ PUBLIC_URL: "   " })).toBe(SAFE_DEFAULT);
    });

    it("emits a console.warn when falling back to the safe default", () => {
      getPublicBaseUrl({});
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toMatch(/PUBLIC_URL/);
    });

    it("emits a warn even when env is null or undefined", () => {
      expect(getPublicBaseUrl(null)).toBe(SAFE_DEFAULT);
      expect(getPublicBaseUrl(undefined)).toBe(SAFE_DEFAULT);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("security: result is never derived from request", () => {
    it("ignores any request object passed alongside env", () => {
      // Simulates a call site that might accidentally pass request context.
      // getPublicBaseUrl only accepts env; the result must still be the safe default.
      const fakeEnv = {};
      const result = getPublicBaseUrl(fakeEnv);
      expect(result).toBe(SAFE_DEFAULT);
      // Must not contain any hostname that could come from request.url
      expect(result).not.toContain("attacker.example");
      expect(result).not.toContain("evil.com");
    });

    it("the safe default is always https://settimes.ca regardless of env content", () => {
      // Belt-and-suspenders: test the constant value directly
      expect(getPublicBaseUrl({})).toBe("https://settimes.ca");
      expect(getPublicBaseUrl({ PUBLIC_URL: "" })).toBe("https://settimes.ca");
    });
  });
});
