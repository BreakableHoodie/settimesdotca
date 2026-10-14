import { describe, it, expect } from "vitest";
import { createTestEnv, insertBand, insertEvent } from "../../test-utils";
import * as followHandler from "../[name]/follow.js";
import * as confirmHandler from "../[name]/confirm-follow.js";

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
    await followHandler.onRequestPost({
      request: followReq,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });

    const pending = rawDb
      .prepare(
        "SELECT verified, confirmed_at, verification_token FROM band_follows WHERE email=? AND band_profile_id=?",
      )
      .get("fan@example.com", band.band_profile_id);
    expect(pending.verified).toBe(0);
    expect(pending.verification_token).toBeTruthy();

    // A scanner GET must not confirm the follow.
    const confirmReq = new Request(
      `https://example.test/api/bands/${band.band_profile_id}/confirm-follow?token=${pending.verification_token}`,
    );
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
        body: new URLSearchParams({ token: pending.verification_token }),
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
    await followHandler.onRequestPost({
      request: followReq,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });

    const { verification_token: token } = rawDb
      .prepare("SELECT verification_token FROM band_follows WHERE email=? AND band_profile_id=?")
      .get("fan@example.com", band.band_profile_id);

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
});
