import { describe, it, expect } from "vitest";
import { validateCSRFMiddleware, generateCSRFToken } from "../csrf.js";
import { API_KEY_PREFIX } from "../apiKeys.js";

// Minimal env — local dev so CSRF_SECRET not required
const devEnv = { ENVIRONMENT: "development" };

function makeRequest(url, method, headers = {}) {
  return new Request(url, { method, headers });
}

describe("CSRF middleware — rejection paths (T5)", () => {
  it("blocks auth route mutation with no Origin header", () => {
    const req = makeRequest("https://settimes.ca/api/admin/auth/login", "POST", { "Content-Type": "application/json" });
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it("blocks auth route mutation with mismatched Origin header", () => {
    const req = makeRequest("https://settimes.ca/api/admin/auth/login", "POST", {
      Origin: "https://evil.example.com",
      "Content-Type": "application/json",
    });
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it("allows auth route mutation with matching Origin header", () => {
    const req = makeRequest("https://settimes.ca/api/admin/auth/login", "POST", {
      Origin: "https://settimes.ca",
      "Content-Type": "application/json",
    });
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).toBeNull();
  });

  it("treats a trailing-slash logout as the authenticated logout route", () => {
    const req = makeRequest("https://settimes.ca/api/admin/auth/logout/", "POST", {
      Origin: "https://settimes.ca",
    });
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it("allows GET requests through without CSRF check", () => {
    const req = makeRequest("https://settimes.ca/api/admin/auth/login", "GET");
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).toBeNull();
  });
});

describe("CSRF session identifier ignores API keys", () => {
  const url = "https://settimes.ca/api/admin/bands";
  const keyLike = `${API_KEY_PREFIX}notarealkeyvalue0123456789`;

  function post(authorization, token) {
    return new Request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization}`,
        Cookie: `csrf_token=${token}`,
        "X-CSRF-Token": token,
      },
    });
  }

  it("accepts a token bound to a session-id bearer (control: the Bearer fallback works)", () => {
    const sessionId = "11111111-2222-3333-4444-555555555555";
    const token = generateCSRFToken(new Request(url), devEnv, sessionId);
    expect(validateCSRFMiddleware(post(sessionId, token), devEnv)).toBeNull();
  });

  it("does not use a bearer starting with the API key prefix as the HMAC identifier", () => {
    // A token bound to the key itself validates only if the key was read as the
    // identifier. It must not: the request falls back to the csrf cookie instead.
    const token = generateCSRFToken(new Request(url), devEnv, keyLike);
    const result = validateCSRFMiddleware(post(keyLike, token), devEnv);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });
});
