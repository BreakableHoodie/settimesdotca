// Tests for the Cloudflare Turnstile bot-gate (#673). Previously zero direct
// coverage — CLAUDE.md names verifyTurnstile()'s fail-closed-in-production
// posture explicitly ("mirrors the CSRF_SECRET handling in utils/csrf.js"),
// and it gates every public email-input endpoint (subscribe, follow,
// follow-batch). This file pins the fail-closed branch itself, plus the
// #682 early-return-on-non-2xx and network-failure paths so a future "make
// local dev easier" change can't silently reopen the bot gate.
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../turnstile.js";

function makeRequest(headers = {}) {
  return new Request("https://settimes.ca/api/bands/some-band/follow", {
    method: "POST",
    headers,
  });
}

describe("verifyTurnstile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("TURNSTILE_SECRET_KEY unset", () => {
    it("fails CLOSED in production (no ENVIRONMENT set) — the critical invariant", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const request = makeRequest();
      const env = {}; // no TURNSTILE_SECRET_KEY, no ENVIRONMENT

      const result = await verifyTurnstile(request, env, "some-token");

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("required in production");
    });

    it("fails CLOSED in production (ENVIRONMENT explicitly 'production')", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const request = makeRequest();
      const env = { ENVIRONMENT: "production" };

      const result = await verifyTurnstile(request, env, "some-token");

      expect(result).toBe(false);
    });

    it("allows the request ONLY when isDevRequest() is true (env.ENVIRONMENT === 'test')", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const request = makeRequest();
      const env = { ENVIRONMENT: "test" };

      const result = await verifyTurnstile(request, env, "some-token");

      expect(result).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain("local dev only");
    });

    it("allows the request when env.ENVIRONMENT === 'development'", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const request = makeRequest();
      const env = { ENVIRONMENT: "development" };

      const result = await verifyTurnstile(request, env, "some-token");

      expect(result).toBe(true);
    });

    it("does NOT trust a client-controlled header to decide dev — only env.ENVIRONMENT matters", async () => {
      // isDevRequest() is documented (auth.js #425) to never trust request
      // headers for this decision. A request merely claiming to be from
      // localhost must still fail closed when ENVIRONMENT is unset/prod.
      vi.spyOn(console, "error").mockImplementation(() => {});
      const request = makeRequest({ Host: "localhost", "X-Forwarded-Host": "127.0.0.1" });
      const env = {};

      const result = await verifyTurnstile(request, env, "some-token");

      expect(result).toBe(false);
    });
  });

  describe("TURNSTILE_SECRET_KEY set", () => {
    const envWithSecret = { TURNSTILE_SECRET_KEY: "test-secret-key" };

    it("returns false without calling fetch when the token is missing", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, undefined);

      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns false without calling fetch when the token is not a string", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, { not: "a string" });

      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns true on a 2xx response with success: true", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        })),
      );
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, "valid-token");

      expect(result).toBe(true);
    });

    it("returns false on a 2xx response with success: false", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
        })),
      );
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, "bad-token");

      expect(result).toBe(false);
    });

    it("returns false and never trusts the body when siteverify responds non-2xx (#682)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const jsonSpy = vi.fn(async () => ({ success: true })); // must NOT be consulted
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 503,
          json: jsonSpy,
        })),
      );
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, "some-token");

      expect(result).toBe(false);
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      const warnOutput = warnSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(warnOutput).toContain("non-2xx");
      expect(warnOutput).toContain('"status":503');
    });

    it("returns false and logs when the fetch throws (network failure)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("simulated network failure");
        }),
      );
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, "some-token");

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      const warnOutput = warnSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(warnOutput).toContain("siteverify request failed");
    });

    it("returns false when the response body is not valid JSON", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        })),
      );
      const request = makeRequest();

      const result = await verifyTurnstile(request, envWithSecret, "some-token");

      expect(result).toBe(false);
    });

    it("forwards the secret, token, and client IP to siteverify", async () => {
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      }));
      vi.stubGlobal("fetch", fetchSpy);
      const request = makeRequest({ "CF-Connecting-IP": "203.0.113.7" });

      await verifyTurnstile(request, envWithSecret, "valid-token");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(options.method).toBe("POST");
      const body = new URLSearchParams(options.body);
      expect(body.get("secret")).toBe("test-secret-key");
      expect(body.get("response")).toBe("valid-token");
      expect(body.get("remoteip")).toBe("203.0.113.7");
    });
  });
});
