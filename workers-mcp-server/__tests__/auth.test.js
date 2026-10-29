import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorized } from "../src/auth.js";

const secret = "a".repeat(64);
const request = (authorization) =>
  new globalThis.Request("https://mcp.example.com/mcp", {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });

describe("isAuthorized", () => {
  it.each([
    ["no header", undefined],
    ["Basic auth", "Basic x"],
    ["empty Bearer token", "Bearer "],
    ["wrong token", `Bearer ${"b".repeat(64)}`],
    ["token that is a prefix of the secret", `Bearer ${secret.slice(0, 32)}`],
  ])("rejects %s", async (_name, authorization) => {
    await expect(isAuthorized(request(authorization), { SHARED_SECRET: secret })).resolves.toBe(false);
  });

  it("rejects a missing secret", async () => {
    await expect(isAuthorized(request(`Bearer ${secret}`), {})).resolves.toBe(false);
  });

  it("rejects a short secret even when the token matches it", async () => {
    // The token equals the secret, so only the length floor can refuse it.
    const short = "a".repeat(31);
    await expect(isAuthorized(request(`Bearer ${short}`), { SHARED_SECRET: short })).resolves.toBe(false);
  });

  it("refuses a secret containing whitespace and says so in the log", async () => {
    // The header match already rejects a spaced token, so the result alone
    // cannot tell this check apart from its absence: the log line is what an
    // operator debugging a 401 on every request needs, so that is asserted.
    const error = vi.spyOn(globalThis.console, "error").mockImplementation(() => {});
    const spaced = `${"a".repeat(20)} ${"a".repeat(20)}`;
    try {
      await expect(isAuthorized(request(`Bearer ${spaced}`), { SHARED_SECRET: spaced })).resolves.toBe(false);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("contains whitespace"));
    } finally {
      error.mockRestore();
    }
  });

  it("accepts the exact token", async () => {
    await expect(isAuthorized(request(`Bearer ${secret}`), { SHARED_SECRET: secret })).resolves.toBe(true);
  });

  describe("on Workers, where crypto.subtle.timingSafeEqual exists", () => {
    // Node has no subtle.timingSafeEqual, so without this the tests only ever
    // run the fallback loop, never the branch production takes.
    afterEach(() => {
      delete globalThis.crypto.subtle.timingSafeEqual;
    });

    it.each([true, false])("returns what timingSafeEqual returns (%s)", async (verdict) => {
      const spy = vi.fn(() => verdict);
      globalThis.crypto.subtle.timingSafeEqual = spy;
      await expect(isAuthorized(request(`Bearer ${secret}`), { SHARED_SECRET: secret })).resolves.toBe(verdict);
      expect(spy).toHaveBeenCalledOnce();
      const [a, b] = spy.mock.calls[0];
      expect([a.byteLength, b.byteLength]).toEqual([32, 32]);
    });
  });
});
