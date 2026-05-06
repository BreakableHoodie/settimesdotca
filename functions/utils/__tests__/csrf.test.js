import { describe, it, expect } from "vitest";
import { validateCSRFMiddleware } from "../csrf.js";

// Minimal env — local dev so CSRF_SECRET not required
const devEnv = { ENVIRONMENT: "development" };

function makeRequest(url, method, headers = {}) {
  return new Request(url, { method, headers });
}

describe("CSRF middleware — rejection paths (T5)", () => {
  it("blocks auth route mutation with no Origin header", () => {
    const req = makeRequest(
      "https://settimes.ca/api/admin/auth/login",
      "POST",
      { "Content-Type": "application/json" }
    );
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it("blocks auth route mutation with mismatched Origin header", () => {
    const req = makeRequest(
      "https://settimes.ca/api/admin/auth/login",
      "POST",
      { Origin: "https://evil.example.com", "Content-Type": "application/json" }
    );
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it("allows auth route mutation with matching Origin header", () => {
    const req = makeRequest(
      "https://settimes.ca/api/admin/auth/login",
      "POST",
      { Origin: "https://settimes.ca", "Content-Type": "application/json" }
    );
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).toBeNull();
  });

  it("allows GET requests through without CSRF check", () => {
    const req = makeRequest(
      "https://settimes.ca/api/admin/auth/login",
      "GET"
    );
    const result = validateCSRFMiddleware(req, devEnv);
    expect(result).toBeNull();
  });
});
