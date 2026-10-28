// #1310: an allowlisted origin gets credentialed CORS, so every built-in
// origin must be a host we control. The list carried
// settimesdotca.pages.dev and dev.settimesdotca.pages.dev (never ours; the
// Pages project is served at longweekend-bandcrawl.pages.dev, so anyone could
// claim those names) and dev.settimes.ca (DNS removed 2026-08-29). The
// document CSP's connect-src likewise allowed any *.pages.dev host.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { onRequest } from "../_middleware.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function allowOriginFor(origin, env = {}) {
  const request = new Request("https://settimes.ca/api/venues", {
    headers: { Origin: origin, "CF-Connecting-IP": "127.0.0.1" },
  });
  const next = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  const response = await onRequest({ request, env, data: {}, next });
  return response.headers.get("Access-Control-Allow-Origin");
}

describe("CORS allowlist holds only hosts we control (#1310)", () => {
  test.each(["https://settimesdotca.pages.dev", "https://dev.settimesdotca.pages.dev", "https://dev.settimes.ca"])(
    "%s is no longer allowed",
    async (origin) => {
      expect(await allowOriginFor(origin)).toBeNull();
    },
  );

  test("production origins still are", async () => {
    expect(await allowOriginFor("https://settimes.ca")).toBe("https://settimes.ca");
    expect(await allowOriginFor("https://www.settimes.ca")).toBe("https://www.settimes.ca");
  });

  test("loopback origins are credentialed only on a known dev environment", async () => {
    const loopback = "http://localhost:5173";
    // Production (ENVIRONMENT unset or "production") and preview are not dev.
    expect(await allowOriginFor(loopback)).toBeNull();
    expect(await allowOriginFor(loopback, { ENVIRONMENT: "production" })).toBeNull();
    expect(await allowOriginFor(loopback, { ENVIRONMENT: "preview" })).toBeNull();
    expect(await allowOriginFor("http://127.0.0.1:8788", {})).toBeNull();
    // Local wrangler and the test harness still work.
    expect(await allowOriginFor(loopback, { ENVIRONMENT: "development" })).toBe(loopback);
    expect(await allowOriginFor("http://127.0.0.1:8788", { ENVIRONMENT: "test" })).toBe("http://127.0.0.1:8788");
    // And production origins are unaffected by the environment.
    expect(await allowOriginFor("https://settimes.ca", { ENVIRONMENT: "production" })).toBe("https://settimes.ca");
  });

  test("a preview alias is added only through CORS_ALLOWED_ORIGINS", async () => {
    const alias = "https://edge-e2e.longweekend-bandcrawl.pages.dev";
    expect(await allowOriginFor(alias)).toBeNull();
    expect(await allowOriginFor(alias, { CORS_ALLOWED_ORIGINS: alias })).toBe(alias);
  });

  test("every built-in https origin in the source is settimes.ca or www.settimes.ca", () => {
    const source = readFileSync(join(ROOT, "functions/_middleware.js"), "utf8");
    const block = source.match(/const baseAllowedOrigins = \[([\s\S]*?)\];/);
    expect(block, "baseAllowedOrigins not found: update this guard").not.toBeNull();
    const https = [...block[1].matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(https.length).toBeGreaterThan(0);
    expect(https.filter((o) => !["https://settimes.ca", "https://www.settimes.ca"].includes(o))).toEqual([]);
  });

  test("the document CSP's connect-src names no wildcard host outside settimes.ca", () => {
    const headers = readFileSync(join(ROOT, "frontend/public/_headers"), "utf8");
    const connectSrcs = [...headers.matchAll(/connect-src ([^;]+);/g)].map((m) => m[1]);
    expect(connectSrcs.length).toBeGreaterThanOrEqual(2);
    for (const value of connectSrcs) {
      const wildcards = value.split(/\s+/).filter((token) => token.includes("*"));
      expect(wildcards.filter((token) => token !== "https://*.settimes.ca")).toEqual([]);
    }
  });
});
