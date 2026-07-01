import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";

// Mock announce digest so we can assert it was called without real email I/O.
vi.mock("../../utils/announceDigest.js", () => ({
  flushAnnounceDigest: vi.fn(() => Promise.resolve({ sent: 0, failed: 0, skipped: 0 })),
}));

import { flushAnnounceDigest } from "../../utils/announceDigest.js";
import { scheduled } from "../../_scheduled.js";

describe("scheduled()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes flushAnnounceDigest on every scheduled run", async () => {
    const { env } = createTestEnv();
    await scheduled({}, env, {});
    expect(flushAnnounceDigest).toHaveBeenCalledOnce();
    expect(flushAnnounceDigest).toHaveBeenCalledWith(env, env.DB);
  });

  it("does not throw when flushAnnounceDigest rejects (best-effort)", async () => {
    flushAnnounceDigest.mockRejectedValueOnce(new Error("email provider down"));
    const { env } = createTestEnv();
    await expect(scheduled({}, env, {})).resolves.not.toThrow();
  });

  it("still runs on an empty queue without error", async () => {
    const { env } = createTestEnv();
    // Default mock returns { sent:0, failed:0, skipped:0 } — simulate empty queue
    await expect(scheduled({}, env, {})).resolves.not.toThrow();
    expect(flushAnnounceDigest).toHaveBeenCalledOnce();
  });
});
