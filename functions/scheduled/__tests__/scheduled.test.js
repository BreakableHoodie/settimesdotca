import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";

// Mock announce digest so we can assert it was called without real email I/O.
vi.mock("../../utils/announceDigest.js", () => ({
  flushAnnounceDigest: vi.fn(() => Promise.resolve({ sent: 0, failed: 0, skipped: 0, unconfirmed: 0 })),
}));
vi.mock("../aggregate-stats.js", () => ({
  scheduled: vi.fn(() => Promise.resolve({ failures: [] })),
}));
vi.mock("../expire-share-links.js", () => ({
  expireShareLinks: vi.fn(() => Promise.resolve({ failures: [] })),
}));
vi.mock("../anonymize-schedule-builds.js", () => ({
  anonymizeScheduleBuilds: vi.fn(() => Promise.resolve({ failures: [] })),
}));

import { flushAnnounceDigest } from "../../utils/announceDigest.js";
import { scheduled as aggregateStats } from "../aggregate-stats.js";
import { expireShareLinks } from "../expire-share-links.js";
import { anonymizeScheduleBuilds } from "../anonymize-schedule-builds.js";
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

  it("throws the failed digest step after attempting every step", async () => {
    flushAnnounceDigest.mockRejectedValueOnce(new Error("email provider down"));
    const { env } = createTestEnv();
    const error = await scheduled({}, env, {}).catch((err) => err);
    expect(error).toMatchObject({ failedSteps: ["flush-announce-digest"] });
    expect(aggregateStats).toHaveBeenCalledOnce();
    expect(expireShareLinks).toHaveBeenCalledOnce();
    expect(anonymizeScheduleBuilds).toHaveBeenCalledOnce();
    expect(error.errors).toHaveLength(error.failedSteps.length);
  });

  it("throws when the digest reports undelivered messages", async () => {
    flushAnnounceDigest.mockResolvedValueOnce({ sent: 0, failed: 1, skipped: 0 });
    const { env } = createTestEnv();

    await expect(scheduled({}, env, {})).rejects.toMatchObject({
      failedSteps: ["flush-announce-digest"],
    });
  });

  it("throws when the digest reports an unconfirmed delivery", async () => {
    flushAnnounceDigest.mockResolvedValueOnce({ sent: 1, failed: 0, skipped: 0, unconfirmed: 1 });
    const { env } = createTestEnv();

    const error = await scheduled({}, env, {}).catch((err) => err);
    expect(error.failedSteps).toEqual(["flush-announce-digest(unconfirmed)"]);
    expect(error.errors).toHaveLength(1);
  });

  it("still runs on an empty queue without error", async () => {
    const { env } = createTestEnv();
    // Default mock returns zero counts — simulate an empty queue.
    await expect(scheduled({}, env, {})).resolves.not.toThrow();
    expect(flushAnnounceDigest).toHaveBeenCalledOnce();
  });
});
