import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/admin/maintenance/retention.js", () => ({
  runRetentionCleanup: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../../scheduled/expire-share-links.js", () => ({
  expireShareLinks: vi.fn(() => Promise.resolve({ failures: [] })),
}));
vi.mock("../../../scheduled/anonymize-schedule-builds.js", () => ({
  anonymizeScheduleBuilds: vi.fn(() => Promise.resolve({ failures: [] })),
}));

import { createTestEnv } from "../../test-utils.js";
import { onRequestPost } from "../run-scheduled.js";
import { runRetentionCleanup } from "../../../api/admin/maintenance/retention.js";
import { expireShareLinks } from "../../../scheduled/expire-share-links.js";
import { anonymizeScheduleBuilds } from "../../../scheduled/anonymize-schedule-builds.js";

const SECRET = "test-cron-secret-for-unit-tests";

function makeRequest(headers = {}) {
  return new Request("https://example.test/api/internal/run-scheduled", {
    method: "POST",
    headers,
  });
}

function makeContext(request, envOverrides = {}) {
  const { env } = createTestEnv({ role: "admin" });
  return {
    request,
    env: { ...env, ...envOverrides },
    waitUntil: () => {},
  };
}

describe("POST /api/internal/run-scheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    const ctx = makeContext(makeRequest(), { CRON_SECRET: undefined });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(503);
    const body = await res.json();
    // Generic body hides the internal env-var name from callers (server log
    // still records the specific reason via console.error).
    expect(body.error).toBe("Service unavailable");
  });

  it("returns 503 when CRON_SECRET is an empty string", async () => {
    const ctx = makeContext(makeRequest(), { CRON_SECRET: "" });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(503);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const ctx = makeContext(makeRequest(), { CRON_SECRET: SECRET });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when Bearer token is wrong", async () => {
    const ctx = makeContext(makeRequest({ Authorization: "Bearer wrong-secret" }), { CRON_SECRET: SECRET });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-Cron-Secret header has wrong token", async () => {
    const ctx = makeContext(makeRequest({ "X-Cron-Secret": "not-the-secret" }), { CRON_SECRET: SECRET });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 200 and invokes scheduled handler when Bearer token is correct", async () => {
    const ctx = makeContext(makeRequest({ Authorization: `Bearer ${SECRET}` }), { CRON_SECRET: SECRET });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.ranAt).toBe("string");
    expect(typeof body.durationMs).toBe("number");
  });

  it("returns 200 when X-Cron-Secret header carries the correct token", async () => {
    const ctx = makeContext(makeRequest({ "X-Cron-Secret": SECRET }), {
      CRON_SECRET: SECRET,
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 for retention failure after running later steps", async () => {
    runRetentionCleanup.mockRejectedValueOnce(new Error("retention unavailable"));
    const ctx = makeContext(makeRequest({ Authorization: `Bearer ${SECRET}` }), { CRON_SECRET: SECRET });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, failedSteps: ["retention"] });
    expect(typeof body.ranAt).toBe("string");
    expect(typeof body.durationMs).toBe("number");
    expect(expireShareLinks).toHaveBeenCalledOnce();
    expect(anonymizeScheduleBuilds).toHaveBeenCalledOnce();
  });
});
