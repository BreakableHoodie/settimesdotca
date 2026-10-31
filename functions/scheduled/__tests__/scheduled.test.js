import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";

vi.mock("../aggregate-stats.js", () => ({
  scheduled: vi.fn(() => Promise.resolve({ failures: [] })),
}));
vi.mock("../expire-share-links.js", () => ({
  expireShareLinks: vi.fn(() => Promise.resolve({ failures: [] })),
}));
vi.mock("../anonymize-schedule-builds.js", () => ({
  anonymizeScheduleBuilds: vi.fn(() => Promise.resolve({ failures: [] })),
}));

import { scheduled as aggregateStats } from "../aggregate-stats.js";
import { expireShareLinks } from "../expire-share-links.js";
import { anonymizeScheduleBuilds } from "../anonymize-schedule-builds.js";
import { scheduled } from "../../_scheduled.js";

describe("scheduled()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs every step on every scheduled run", async () => {
    const { env } = createTestEnv();
    await scheduled({}, env, {});
    expect(aggregateStats).toHaveBeenCalledOnce();
    expect(expireShareLinks).toHaveBeenCalledOnce();
    expect(anonymizeScheduleBuilds).toHaveBeenCalledOnce();
  });

  it("throws the failed step after attempting every step", async () => {
    expireShareLinks.mockRejectedValueOnce(new Error("d1 down"));
    const { env } = createTestEnv();
    const error = await scheduled({}, env, {}).catch((err) => err);
    expect(error).toMatchObject({ failedSteps: ["expire-share-links"] });
    expect(aggregateStats).toHaveBeenCalledOnce();
    expect(anonymizeScheduleBuilds).toHaveBeenCalledOnce();
    expect(error.errors).toHaveLength(error.failedSteps.length);
  });

  it("surfaces labelled failures a step reports without throwing", async () => {
    anonymizeScheduleBuilds.mockResolvedValueOnce({ failures: ["anonymize-event-7"] });
    const { env } = createTestEnv();
    const error = await scheduled({}, env, {}).catch((err) => err);
    expect(error.failedSteps).toEqual(["anonymize-event-7"]);
    expect(error.errors).toHaveLength(1);
  });
});
