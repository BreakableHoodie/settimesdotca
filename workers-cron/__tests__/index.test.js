import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { CRON_WORKFLOWS } from "../src/index.js";

const TOKEN = "test-dispatch-token-value-0123456789";
const env = { GH_DISPATCH_TOKEN: TOKEN };
const base = "https://api.github.com/repos/BreakableHoodie/settimesdotca/actions/workflows";

afterEach(() => vi.restoreAllMocks());

const stubFetch = (response) => vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
const quietError = () => vi.spyOn(globalThis.console, "error").mockImplementation(() => {});

describe("cron to workflow mapping", () => {
  it.each([
    ["0 * * * *", "site-health.yml"],
    ["*/30 * * * *", "deploy-reconcile.yml"],
    ["17 7 * * *", "scheduled-jobs.yml"],
  ])("%s dispatches %s", async (cron, workflow) => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await worker.scheduled({ cron }, env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${base}/${workflow}/dispatches`);
  });

  it("every URL is a fixed github.com literal for its own workflow", () => {
    expect(Object.keys(CRON_WORKFLOWS)).toHaveLength(3);
    for (const { workflow, url } of Object.values(CRON_WORKFLOWS)) {
      expect(url).toBe(`${base}/${workflow}/dispatches`);
    }
  });

  it("an unmapped cron throws and sends nothing", async () => {
    quietError();
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(worker.scheduled({ cron: "1 2 3 4 5" }, env)).rejects.toThrow(/Unmapped/);
    await expect(worker.scheduled({ cron: "constructor" }, env)).rejects.toThrow(/Unmapped/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the dispatch request", () => {
  it("is exactly the documented POST", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await worker.scheduled({ cron: "0 * * * *" }, env);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${base}/site-health.yml/dispatches`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "settimes-cron",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({ ref: "main" });
  });
});

describe("failures", () => {
  it("a non-204 throws, logs status and a short excerpt, and never the token", async () => {
    const error = quietError();
    stubFetch(new Response(`Bad credentials ${"x".repeat(1000)}`, { status: 401 }));
    const thrown = await worker.scheduled({ cron: "0 * * * *" }, env).catch((e) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain("401");
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("401");
    expect(logged).toContain("Bad credentials");
    expect(logged.length).toBeLessThan(400);
    expect(logged).not.toContain(TOKEN);
    expect(thrown.message).not.toContain(TOKEN);
  });

  it("a 200 is not success either (only 204 is)", async () => {
    quietError();
    stubFetch(new Response("{}", { status: 200 }));
    await expect(worker.scheduled({ cron: "0 * * * *" }, env)).rejects.toThrow(/200/);
  });

  it.each([
    ["undefined", {}],
    ["empty", { GH_DISPATCH_TOKEN: "" }],
  ])("a missing token (%s) throws before any request", async (_name, badEnv) => {
    const error = quietError();
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(worker.scheduled({ cron: "0 * * * *" }, badEnv)).rejects.toThrow(/GH_DISPATCH_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});

describe("fetch handler", () => {
  it.each(["GET", "POST"])("answers 404 to %s", async (method) => {
    const res = await worker.fetch(new Request("https://x.example/anything", { method }));
    expect(res.status).toBe(404);
  });
});
