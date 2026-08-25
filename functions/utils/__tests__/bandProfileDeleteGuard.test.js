import { describe, expect, it, vi } from "vitest";
import { onRequestProfileDelete } from "../bandProfileResource.js";

/**
 * #935 rejected malformed `profile_` ids (`profile_1_extra` must not resolve to
 * profile 1). Extracting the handler in #908 briefly re-gated that check on
 * `!valid`, which is true today only because a `profile_`-prefixed id always
 * fails validateId — a security check resting on a separate validator's current
 * behaviour.
 *
 * Nothing caught the weakening: the whole admin/bands suite passed either way.
 * This asserts the contract directly, with `valid: true` supplied so the guard
 * cannot pass by leaning on it.
 */
describe("onRequestProfileDelete id guard", () => {
  const context = () => ({
    env: {
      DB: {
        prepare: vi.fn(() => {
          throw new Error("DB must not be touched for a malformed id");
        }),
      },
    },
    user: { userId: 1 },
    ipAddress: "127.0.0.1",
  });

  it("rejects a null profile id even when the caller reports the raw id as valid", async () => {
    const response = await onRequestProfileDelete(context(), {
      performanceId: "profile_1_extra",
      valid: true,
      bandProfileId: null,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/invalid profile id/i);
  });

  it("rejects a null profile id when the raw id is also invalid", async () => {
    const response = await onRequestProfileDelete(context(), {
      performanceId: "profile_abc",
      valid: false,
      bandProfileId: null,
    });

    expect(response.status).toBe(400);
  });

  it("never reaches the database for a malformed id", async () => {
    const ctx = context();
    await onRequestProfileDelete(ctx, { performanceId: "profile_9_x", valid: true, bandProfileId: null });
    expect(ctx.env.DB.prepare).not.toHaveBeenCalled();
  });
});
