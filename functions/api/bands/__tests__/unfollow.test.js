import { describe, it, expect } from "vitest";
import { createTestEnv, insertBand, insertEvent } from "../../test-utils";
import { onRequestGet, onRequestPost } from "../[name]/unfollow.js";
import { hashStoredToken } from "../../../utils/tokens.js";
import { unsubscribeToken, UNSUBSCRIBE_KINDS } from "../../../utils/unsubscribeLinks.js";

describe("/api/bands/:name/unfollow", () => {
  it("GET renders a form without deleting the follow, then POST deletes it", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-unfollow" });
    const band = insertBand(rawDb, { name: "Witchrot", event_id: ev.id });
    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)")
      .run("fan@example.com", band.band_profile_id, await hashStoredToken("valid-token-abc"));

    const getRes = await onRequestGet({
      request: new Request("https://example.test/api/bands/1/unfollow?token=valid-token-abc"),
      env,
    });
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).toContain('method="post"');
    expect(rawDb.prepare("SELECT * FROM band_follows WHERE id=?").get(1)).toBeTruthy();

    const res = await onRequestPost({
      request: new Request("https://example.test/api/bands/1/unfollow?token=valid-token-abc", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: "valid-token-abc" }),
      }),
      env,
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Unfollowed");
    // Should name the specific band the fan unsubscribed from, not "this band".
    expect(body).toContain("Witchrot");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const row = rawDb.prepare("SELECT * FROM band_follows WHERE id=?").get(1);
    expect(row).toBeUndefined();
  });

  it("POST supports RFC 8058 query-string token fallback", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-unfollow-one-click" });
    const band = insertBand(rawDb, { name: "One Click Band", event_id: ev.id });
    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)")
      .run("fan@example.com", band.band_profile_id, await hashStoredToken("one-click-token"));

    const res = await onRequestPost({
      request: new Request("https://example.test/api/bands/1/unfollow?token=one-click-token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      env,
    });

    expect(res.status).toBe(200);
    expect(rawDb.prepare("SELECT * FROM band_follows WHERE id=?").get(1)).toBeUndefined();
  });

  it("unfollows only the row named by a derived token", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Derived Event" });
    const band = insertBand(rawDb, { name: "Derived Band", event_id: event.id });
    const first = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)")
      .run("one@example.com", band.band_profile_id, "sha256:first").lastInsertRowid;
    const second = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)")
      .run("two@example.com", band.band_profile_id, "sha256:second").lastInsertRowid;
    const token = await unsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, first);

    const response = await onRequestPost({
      request: new Request(`https://example.test/api/bands/1/unfollow?token=${token}`, { method: "POST" }),
      env,
    });

    expect(response.status).toBe(200);
    expect(rawDb.prepare("SELECT id FROM band_follows WHERE id=?").get(first)).toBeUndefined();
    expect(rawDb.prepare("SELECT id FROM band_follows WHERE id=?").get(second)).toBeTruthy();
  });

  it("does not redeem a stored digest or a token for another kind", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Safe Event" });
    const band = insertBand(rawDb, { name: "Safe Band", event_id: event.id });
    const id = rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)")
      .run("fan@example.com", band.band_profile_id, "sha256:stored").lastInsertRowid;
    const bandToken = await unsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, id);
    const subscriptionToken = await unsubscribeToken(env, UNSUBSCRIBE_KINDS.subscription, id);

    for (const token of ["sha256:stored", subscriptionToken]) {
      await onRequestPost({
        request: new Request(`https://example.test/api/bands/1/unfollow?token=${encodeURIComponent(token)}`, {
          method: "POST",
        }),
        env,
      });
    }
    expect(rawDb.prepare("SELECT id FROM band_follows WHERE id=?").get(id)).toBeTruthy();
    await onRequestPost({
      request: new Request(`https://example.test/api/bands/1/unfollow?token=${bandToken}`, { method: "POST" }),
      env,
    });
    expect(rawDb.prepare("SELECT id FROM band_follows WHERE id=?").get(id)).toBeUndefined();
  });

  it("returns 200 even when the token does not exist (avoids enumeration)", async () => {
    const { env } = createTestEnv();

    const res = await onRequestGet({
      request: new Request("https://example.test/api/bands/1/unfollow?token=nonexistent-token"),
      env,
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 for a missing token", async () => {
    const { env } = createTestEnv();

    const res = await onRequestGet({
      request: new Request("https://example.test/api/bands/1/unfollow"),
      env,
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a token that exceeds 256 characters", async () => {
    const { env } = createTestEnv();
    const longToken = "a".repeat(257);

    const res = await onRequestGet({
      request: new Request(`https://example.test/api/bands/1/unfollow?token=${longToken}`),
      env,
    });

    expect(res.status).toBe(400);
  });
});
