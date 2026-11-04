// /API/... reaches Functions (the _routes.json "/*" include, #1446), so the
// middleware must treat it as the API: body-size guard, security headers,
// request id, FK pragma. A raw, case-sensitive "/api/" check sent it down the
// page branch, which skips all of them.
import { describe, expect, test } from "vitest";
import { onRequest } from "../_middleware.js";

const HEADERS = { "CF-Connecting-IP": "127.0.0.1" };
const okNext = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

describe("_middleware.js treats /API/ as the API", () => {
  test("an oversized body on /API/metrics is rejected with 413", async () => {
    const request = new Request("https://settimes.ca/API/metrics", {
      method: "POST",
      headers: { ...HEADERS, "Content-Length": "2000000", "Content-Type": "application/json" },
      body: "{}",
    });
    const response = await onRequest({ request, env: {}, data: {}, next: okNext });
    expect(response.status).toBe(413);
  });

  test("/API/ responses carry the API security headers and a request id", async () => {
    const request = new Request("https://settimes.ca/API/venues", { headers: HEADERS });
    const response = await onRequest({ request, env: {}, data: {}, next: okNext });
    expect(response.headers.get("X-Request-ID")).toBeTruthy();
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(
      response.headers.get("Content-Security-Policy") || response.headers.get("Content-Security-Policy-Report-Only"),
    ).toBeTruthy();
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age");
  });

  test("a mutating /API/ request runs PRAGMA foreign_keys = ON before the handler", async () => {
    const executed = [];
    const DB = {
      prepare: (sql) => ({
        run: async () => {
          executed.push(sql);
          return { success: true, meta: { changes: 0 } };
        },
      }),
    };
    const request = new Request("https://settimes.ca/API/venues", { method: "POST", headers: HEADERS });
    await onRequest({ request, env: { DB }, data: {}, next: okNext });
    expect(executed).toContain("PRAGMA foreign_keys = ON");
  });

  test("a non-API page route does not get API handling", async () => {
    const request = new Request("https://settimes.ca/about", { headers: HEADERS });
    const response = await onRequest({ request, env: {}, data: {}, next: okNext });
    expect(response.headers.get("X-Request-ID")).toBeNull();
  });
});
