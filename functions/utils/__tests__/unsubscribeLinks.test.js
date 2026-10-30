import { describe, expect, it, vi } from "vitest";
import {
  isDerivedUnsubscribeToken,
  unsubscribeToken,
  UNSUBSCRIBE_KINDS,
  verifyUnsubscribeToken,
} from "../unsubscribeLinks.js";

const env = { CSRF_SECRET: "test-csrf-secret-for-unit-tests" };

describe("unsubscribeLinks", () => {
  it.each(Object.values(UNSUBSCRIBE_KINDS))("round-trips %s ids", async (kind) => {
    const token = await unsubscribeToken(env, kind, "5");
    expect(token).toMatch(/^u1\.5\.[A-Za-z0-9_-]{43}$/);
    expect(await verifyUnsubscribeToken(env, kind, token)).toBe(5);
    expect(isDerivedUnsubscribeToken(token)).toBe(true);
  });

  it("binds the kind, id, and MAC together", async () => {
    const token = await unsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, 5);
    const [, , mac] = token.split(".");
    const flipped = `${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.subscription, token)).toBeNull();
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, `u1.6.${mac}`)).toBeNull();
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, `u1.5.${flipped}`)).toBeNull();
  });

  it.each(["u1.0.x", "u1.5.x.extra", "u1.5.abc=", "nope.5.abc"])("rejects malformed token %s", async (token) => {
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, token)).toBeNull();
  });

  it("rejects a token made with another secret", async () => {
    const token = await unsubscribeToken({ CSRF_SECRET: "other-secret" }, UNSUBSCRIBE_KINDS.bandFollow, 5);
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, token)).toBeNull();
  });

  it("fails closed when the secret is missing", async () => {
    await expect(unsubscribeToken({}, UNSUBSCRIBE_KINDS.bandFollow, 5)).rejects.toThrow(
      "CSRF_SECRET is required to build unsubscribe links",
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await verifyUnsubscribeToken(
        {},
        UNSUBSCRIBE_KINDS.bandFollow,
        "u1.5.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
