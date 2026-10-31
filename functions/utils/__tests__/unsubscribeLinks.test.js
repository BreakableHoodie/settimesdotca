import { describe, expect, it, vi } from "vitest";
import {
  isDerivedUnsubscribeToken,
  unsubscribeToken,
  UNSUBSCRIBE_KINDS,
  verifyUnsubscribeToken,
} from "../unsubscribeLinks.js";
import { logger } from "../logger.js";

// Keys must be 32+ characters; pad the readable names used below.
const key = (name) => name.padEnd(32, "-");

const env = { UNSUBSCRIBE_LINK_SECRET: key("test-unsubscribe-link-secret") };

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
    const token = await unsubscribeToken(
      { UNSUBSCRIBE_LINK_SECRET: key("other-secret") },
      UNSUBSCRIBE_KINDS.bandFollow,
      5,
    );
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, token)).toBeNull();
  });

  it("fails closed when the secret is missing: build and verify both throw", async () => {
    await expect(unsubscribeToken({}, UNSUBSCRIBE_KINDS.bandFollow, 5)).rejects.toThrow(
      "UNSUBSCRIBE_LINK_SECRET (32+ characters) is required to build unsubscribe links",
    );
    await expect(
      verifyUnsubscribeToken({}, UNSUBSCRIBE_KINDS.bandFollow, "u1.5.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
    ).rejects.toThrow("UNSUBSCRIBE_LINK_SECRET (32+ characters) is required to verify unsubscribe links");
  });

  it("is keyed by its own secret, never CSRF_SECRET (#1427)", async () => {
    const csrfOnly = { CSRF_SECRET: key("test-csrf-secret-for-unit-tests") };
    await expect(unsubscribeToken(csrfOnly, UNSUBSCRIBE_KINDS.bandFollow, 5)).rejects.toThrow(
      "UNSUBSCRIBE_LINK_SECRET (32+ characters) is required",
    );
    const token = await unsubscribeToken(
      { UNSUBSCRIBE_LINK_SECRET: csrfOnly.CSRF_SECRET },
      UNSUBSCRIBE_KINDS.bandFollow,
      5,
    );
    expect(await verifyUnsubscribeToken({ ...env, ...csrfOnly }, UNSUBSCRIBE_KINDS.bandFollow, token)).toBeNull();
  });

  it("keeps links signed with the previous key working after a rotation", async () => {
    const before = { UNSUBSCRIBE_LINK_SECRET: key("key-one") };
    const after = { UNSUBSCRIBE_LINK_SECRET: key("key-two"), UNSUBSCRIBE_LINK_SECRET_PREVIOUS: key("key-one") };
    const oldLink = await unsubscribeToken(before, UNSUBSCRIBE_KINDS.subscription, 9);
    const newLink = await unsubscribeToken(after, UNSUBSCRIBE_KINDS.subscription, 9);
    expect(newLink).not.toBe(oldLink);
    expect(await verifyUnsubscribeToken(after, UNSUBSCRIBE_KINDS.subscription, oldLink)).toBe(9);
    expect(await verifyUnsubscribeToken(after, UNSUBSCRIBE_KINDS.subscription, newLink)).toBe(9);
    // The previous key still binds the kind.
    expect(await verifyUnsubscribeToken(after, UNSUBSCRIBE_KINDS.bandFollow, oldLink)).toBeNull();
  });

  it("drops a key once it is two rotations old", async () => {
    const oldest = await unsubscribeToken({ UNSUBSCRIBE_LINK_SECRET: key("key-one") }, UNSUBSCRIBE_KINDS.bandFollow, 3);
    const later = { UNSUBSCRIBE_LINK_SECRET: key("key-three"), UNSUBSCRIBE_LINK_SECRET_PREVIOUS: key("key-two") };
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(await verifyUnsubscribeToken(later, UNSUBSCRIBE_KINDS.bandFollow, oldest)).toBeNull();
    warn.mockRestore();
  });

  it("refuses to verify when only a previous key is set", async () => {
    await expect(
      verifyUnsubscribeToken(
        { UNSUBSCRIBE_LINK_SECRET_PREVIOUS: key("key-one") },
        UNSUBSCRIBE_KINDS.bandFollow,
        "u1.5.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).rejects.toThrow("UNSUBSCRIBE_LINK_SECRET (32+ characters) is required to verify unsubscribe links");
  });

  it("refuses a current key shorter than 32 characters", async () => {
    await expect(
      unsubscribeToken({ UNSUBSCRIBE_LINK_SECRET: "changeme" }, UNSUBSCRIBE_KINDS.bandFollow, 5),
    ).rejects.toThrow("(32+ characters) is required to build");
  });

  it("ignores and reports a previous key shorter than 32 characters", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const short = "changeme";
    const signedWithShort = await unsubscribeToken(
      { UNSUBSCRIBE_LINK_SECRET: short.padEnd(32, "-") },
      UNSUBSCRIBE_KINDS.bandFollow,
      5,
    );
    const withShortPrevious = { ...env, UNSUBSCRIBE_LINK_SECRET_PREVIOUS: short };
    expect(await verifyUnsubscribeToken(withShortPrevious, UNSUBSCRIBE_KINDS.bandFollow, signedWithShort)).toBeNull();
    expect(error).toHaveBeenCalledWith("UNSUBSCRIBE_LINK_SECRET_PREVIOUS is too short and is ignored");
    expect(JSON.stringify(error.mock.calls)).not.toContain(short);
    error.mockRestore();
    warn.mockRestore();
  });

  it("logs a MAC mismatch with the id only, never the token", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const token = await unsubscribeToken(
      { UNSUBSCRIBE_LINK_SECRET: key("rotated-away") },
      UNSUBSCRIBE_KINDS.bandFollow,
      7,
    );
    expect(await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, token)).toBeNull();
    expect(warn).toHaveBeenCalledWith("unsubscribe MAC mismatch", { kind: UNSUBSCRIBE_KINDS.bandFollow, id: 7 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(token.split(".")[2]);
    warn.mockRestore();
  });
});
