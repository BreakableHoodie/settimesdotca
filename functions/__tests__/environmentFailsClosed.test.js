// #1273: production ran with ENVIRONMENT unset, and three call sites compared
// it with `=== "production"`, so production behaved as NON-production: the API
// CSP was report-only, the logger ran at debug level, and password-reset
// completion echoed a debugId. Every environment decision now goes through
// isDevRequest(), which allows dev behaviour only for an explicit dev value and
// fails closed for unset, typos and case variants (#425).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { onRequest } from "../_middleware.js";
import { createLogger } from "../utils/logger.js";
import { onRequestPost as resetPasswordComplete } from "../api/auth/reset-password-complete.js";
import { createTestEnv } from "../api/test-utils.js";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

async function apiResponse(env) {
  const request = new Request("https://example.test/api/venues", { headers: { "CF-Connecting-IP": "127.0.0.1" } });
  const next = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  return onRequest({ request, env, data: {}, next });
}

afterEach(() => vi.restoreAllMocks());

describe("API CSP is enforced unless the environment is explicitly dev (#1273)", () => {
  test.each([
    ["unset", {}],
    ["production", { ENVIRONMENT: "production" }],
    ["a case variant", { ENVIRONMENT: "Production" }],
    ["preview", { ENVIRONMENT: "preview" }],
  ])("ENVIRONMENT %s → enforced", async (_label, env) => {
    const response = await apiResponse(env);
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });

  test("ENVIRONMENT development → report-only", async () => {
    const response = await apiResponse({ ENVIRONMENT: "development" });
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  test("an explicit CSP_ENFORCE still overrides in both directions", async () => {
    expect(
      (await apiResponse({ CSP_ENFORCE: "false" })).headers.get("Content-Security-Policy-Report-Only"),
    ).toBeTruthy();
    expect(
      (await apiResponse({ ENVIRONMENT: "development", CSP_ENFORCE: "true" })).headers.get("Content-Security-Policy"),
    ).toBeTruthy();
  });
});

describe("logger debug output only in an explicit dev environment (#1273)", () => {
  test.each([
    ["unset", {}, false],
    ["production", { ENVIRONMENT: "production" }, false],
    ["development", { ENVIRONMENT: "development" }, true],
  ])("ENVIRONMENT %s → debug logged: %s", (_label, env, expected) => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    createLogger({ env }).debug("probe");
    expect(spy.mock.calls.length > 0).toBe(expected);
  });
});

describe("password-reset completion echoes debugId only in an explicit dev environment (#1273)", () => {
  async function bodyFor(environment) {
    const { env } = createTestEnv();
    if (environment === undefined) delete env.ENVIRONMENT;
    else env.ENVIRONMENT = environment;
    const response = await resetPasswordComplete({
      request: new Request("https://example.test/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
        body: "null",
      }),
      env,
    });
    expect(response.status).toBe(400);
    return response.json();
  }

  test("unset → no debugId", async () => {
    expect(await bodyFor(undefined)).not.toHaveProperty("debugId");
  });

  test("production → no debugId", async () => {
    expect(await bodyFor("production")).not.toHaveProperty("debugId");
  });

  test("development → debugId", async () => {
    expect(await bodyFor("development")).toHaveProperty("debugId");
  });
});

describe("only isDevRequest reads env.ENVIRONMENT (#1273 guard)", () => {
  const READ = /\bENVIRONMENT\b(?!\s*:)/;
  const ALLOWED = new Set(["utils/auth.js"]);

  function sourceFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
      return full.endsWith(".js") ? [full] : [];
    });
  }

  function codeLines(file) {
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
  }

  test("no other non-test file under functions/ reads ENVIRONMENT", () => {
    const offenders = sourceFiles(FUNCTIONS_DIR)
      .map((file) => relative(FUNCTIONS_DIR, file))
      .filter((rel) => !ALLOWED.has(rel) && rel !== "api/test-utils.js")
      .filter((rel) => codeLines(join(FUNCTIONS_DIR, rel)).some((line) => READ.test(line)));
    expect(offenders, "Use isDevRequest(request, env) instead of comparing env.ENVIRONMENT").toEqual([]);
  });

  test("the scan still sees the one allowed read, and flags a planted raw comparison", () => {
    expect(codeLines(join(FUNCTIONS_DIR, "utils/auth.js")).some((line) => READ.test(line))).toBe(true);
    expect(READ.test('  return env?.ENVIRONMENT === "production" ? "info" : "debug";')).toBe(true);
    expect(READ.test('      ENVIRONMENT: "test",')).toBe(false);
  });
});
