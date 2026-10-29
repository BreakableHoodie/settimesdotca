import { describe, it, expect } from "vitest";
import { createTestEnv, insertBand, insertEvent } from "../../test-utils";
import * as followHandler from "../[name]/follow.js";
import * as confirmHandler from "../[name]/confirm-follow.js";
import { hashStoredToken } from "../../../utils/tokens.js";

const waitUntil = () => {};

describe("/api/bands/:name/confirm-follow", () => {
  it("GET renders a confirmation form without changing the pending follow, then POST confirms it", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-confirm" });
    const band = insertBand(rawDb, { name: "Confirm Band", event_id: ev.id });

    // Create the pending (verified=0) follow via the follow endpoint.
    const followReq = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "fan@example.com" }),
    });
    const followResponse = await followHandler.onRequestPost({
      request: followReq,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });
    const { confirmUrl } = await followResponse.json();

    const pending = rawDb
      .prepare(
        "SELECT verified, confirmed_at, verification_token FROM band_follows WHERE email=? AND band_profile_id=?",
      )
      .get("fan@example.com", band.band_profile_id);
    expect(pending.verified).toBe(0);
    expect(pending.verification_token).toBeTruthy();
    expect(pending.verification_token).toBe(await hashStoredToken(new URL(confirmUrl).searchParams.get("token")));

    // A scanner GET must not confirm the follow.
    const confirmReq = new Request(confirmUrl);
    const getRes = await confirmHandler.onRequestGet({
      request: confirmReq,
      env,
      params: { name: String(band.band_profile_id) },
    });
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).toContain('method="post"');
    expect(rawDb.prepare("SELECT verified FROM band_follows WHERE email=?").get("fan@example.com").verified).toBe(0);

    const res = await confirmHandler.onRequestPost({
      request: new Request(confirmReq, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: new URL(confirmUrl).searchParams.get("token") }),
      }),
      env,
      params: { name: String(band.band_profile_id) },
    });
    expect(res.status).toBe(200);

    const confirmed = rawDb
      .prepare(
        "SELECT verified, confirmed_at, verification_token FROM band_follows WHERE email=? AND band_profile_id=?",
      )
      .get("fan@example.com", band.band_profile_id);
    expect(confirmed.verified).toBe(1);
    expect(confirmed.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(confirmed.verification_token).toBeNull();
  });

  it("is idempotent — a second click on a used token changes nothing", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-confirm-twice" });
    const band = insertBand(rawDb, { name: "Twice Band", event_id: ev.id });

    const followReq = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "fan@example.com" }),
    });
    const followResponse = await followHandler.onRequestPost({
      request: followReq,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });

    const { confirmUrl } = await followResponse.json();
    const token = new URL(confirmUrl).searchParams.get("token");

    const url = `https://example.test/api/bands/${band.band_profile_id}/confirm-follow?token=${token}`;
    const params = { name: String(band.band_profile_id) };
    const first = await confirmHandler.onRequestPost({
      request: new Request(url, { method: "POST", body: new URLSearchParams({ token }) }),
      env,
      params,
    });
    const second = await confirmHandler.onRequestPost({
      request: new Request(url, { method: "POST", body: new URLSearchParams({ token }) }),
      env,
      params,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200); // generic "link expired" page, still verified=1
    const row = rawDb
      .prepare("SELECT verified FROM band_follows WHERE email=? AND band_profile_id=?")
      .get("fan@example.com", band.band_profile_id);
    expect(row.verified).toBe(1);
  });

  it("does not accept the stored digest or a retired token as submitted plaintext", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-confirm-digest" });
    const band = insertBand(rawDb, { name: "Digest Band", event_id: ev.id });
    const followResponse = await followHandler.onRequestPost({
      request: new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "digest@example.com" }),
      }),
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });
    const { confirmUrl } = await followResponse.json();
    const stored = rawDb
      .prepare("SELECT verification_token FROM band_follows WHERE email = ?")
      .get("digest@example.com");

    for (const submitted of [stored.verification_token, "retired:1"]) {
      const response = await confirmHandler.onRequestPost({
        request: new Request(confirmUrl, {
          method: "POST",
          body: new URLSearchParams({ token: submitted }),
        }),
        env,
        params: { name: String(band.band_profile_id) },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toMatch(/invalid or has already been used/i);
    }
  });

  it("returns 400 for a missing token", async () => {
    const { env } = createTestEnv();
    const req = new Request("https://example.test/api/bands/1/confirm-follow");
    const res = await confirmHandler.onRequestGet({ request: req, env, params: { name: "1" } });
    expect(res.status).toBe(400);
  });

  it("shows a generic page for an unknown token (no enumeration)", async () => {
    const { env } = createTestEnv();
    const req = new Request("https://example.test/api/bands/1/confirm-follow?token=nonexistent-token");
    const res = await confirmHandler.onRequestGet({ request: req, env, params: { name: "1" } });
    expect(res.status).toBe(200);
  });

  it("rejects an expired pending follow but confirms one within the window", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-confirm-expiry" });
    const band = insertBand(rawDb, { name: "Expiry Band", event_id: ev.id });
    const insert = rawDb.prepare(
      "INSERT INTO band_follows (email, band_profile_id, verification_token, unsubscribe_token, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))",
    );
    insert.run("old@example.com", band.band_profile_id, await hashStoredToken("old-token"), "old-unsub", "-8 days");
    insert.run("new@example.com", band.band_profile_id, await hashStoredToken("new-token"), "new-unsub", "-6 days");

    const post = (token) =>
      confirmHandler.onRequestPost({
        request: new Request(`https://example.test/api/bands/${band.band_profile_id}/confirm-follow`, {
          method: "POST",
          body: new URLSearchParams({ token }),
        }),
        env,
        params: { name: String(band.band_profile_id) },
      });
    await post("old-token");
    await post("new-token");

    const rows = rawDb.prepare("SELECT email, verified FROM band_follows ORDER BY email").all();
    expect(rows).toEqual([
      { email: "new@example.com", verified: 1 },
      { email: "old@example.com", verified: 0 },
    ]);
  });

  it("keeps the update expiry guard when a stale lookup slips through", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-confirm-race" });
    const band = insertBand(rawDb, { name: "Race Band", event_id: ev.id });
    rawDb
      .prepare(
        "INSERT INTO band_follows (email, band_profile_id, verification_token, unsubscribe_token, created_at) VALUES (?, ?, ?, ?, datetime('now', '-8 days'))",
      )
      .run("race@example.com", band.band_profile_id, await hashStoredToken("race-token"), "race-unsub");

    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) =>
      prepare(
        sql.includes("SELECT bf.id")
          ? sql.replace(
              "AND (bf.verified = 1 OR (bf.verified = 0 AND bf.created_at >= datetime('now', '-7 days')))",
              "",
            )
          : sql,
      );

    const res = await confirmHandler.onRequestPost({
      request: new Request(`https://example.test/api/bands/${band.band_profile_id}/confirm-follow`, {
        method: "POST",
        body: new URLSearchParams({ token: "race-token" }),
      }),
      env,
      params: { name: String(band.band_profile_id) },
    });

    expect(rawDb.prepare("SELECT verified FROM band_follows WHERE email = ?").get("race@example.com").verified).toBe(0);
    // And the page must not tell the fan they follow a band they don't.
    const html = await res.text();
    expect(html).not.toMatch(/you&apos;re following/i);
    expect(html).toMatch(/invalid or has already been used/i);
  });
});
