// reset-password.js is a 26-line re-export shim: its POST is
// `export { onRequestPost } from "./reset-password-complete.js"` (covered by
// reset-password-complete.test.js). The only behaviour it owns itself is the
// GET handler, which returns 405 to keep a reset token out of query strings,
// access logs and Referer headers.

import { describe, expect, test } from "vitest";
import { onRequestGet } from "../reset-password.js";

describe("GET /api/auth/reset-password", () => {
  test("returns 405 with an Allow: POST header pointing callers at the validate endpoint", async () => {
    const response = await onRequestGet({});

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");

    const body = await response.json();
    expect(body.message).toBe("Token validation has moved to POST /api/auth/reset-password/validate");
  });
});
