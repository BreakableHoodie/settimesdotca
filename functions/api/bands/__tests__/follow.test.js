import { describe, it, expect } from "vitest";
import { createTestEnv, insertBand, insertEvent } from "../../test-utils";
import * as followHandler from "../[name]/follow.js";

const waitUntil = () => {};

describe("POST /api/bands/:name/follow", () => {
  it("creates a band follow for a valid email and band", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-follow" });
    const band = insertBand(rawDb, { name: "Follow Band", event_id: ev.id });

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "fan@example.com" }),
    });
    const res = await followHandler.onRequestPost({
      request: req,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const row = rawDb
      .prepare("SELECT * FROM band_follows WHERE email=? AND band_profile_id=?")
      .get("fan@example.com", band.band_profile_id);
    expect(row).toBeTruthy();
    // Double opt-in: a new follow is created UNVERIFIED with a pending
    // verification token; it only becomes verified=1 after confirm-follow.
    expect(row.verified).toBe(0);
    expect(row.verification_token).toBeTruthy();
    expect(row.unsubscribe_token).toBeTruthy();
    // CASL/CAN-SPAM: consent fields are always recorded
    expect(row.consent_method).toBe("web_form");
    // CF-Connecting-IP is absent in test requests, so consent_ip is null
    expect(row.consent_ip).toBeNull();
  });

  it("records CF-Connecting-IP as consent_ip when the header is present", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-consent-ip" });
    const band = insertBand(rawDb, { name: "IP Band", event_id: ev.id });

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.42" },
      body: JSON.stringify({ email: "fan2@example.com" }),
    });
    await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) }, waitUntil });

    const row = rawDb
      .prepare("SELECT consent_ip, consent_method FROM band_follows WHERE email=?")
      .get("fan2@example.com");
    expect(row.consent_ip).toBe("203.0.113.42");
    expect(row.consent_method).toBe("web_form");
  });

  it("returns 400 for an invalid email", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-bad-email" });
    const band = insertBand(rawDb, { name: "Band", event_id: ev.id });

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await followHandler.onRequestPost({
      request: req,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 silently if email already follows the band (no duplicate row)", async () => {
    const { env, rawDb } = createTestEnv();
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-dup" });
    const band = insertBand(rawDb, { name: "Dup Band", event_id: ev.id });

    rawDb
      .prepare("INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)")
      .run("fan@example.com", band.band_profile_id, "existing-token");

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "fan@example.com" }),
    });
    const res = await followHandler.onRequestPost({
      request: req,
      env,
      params: { name: String(band.band_profile_id) },
      waitUntil,
    });
    expect(res.status).toBe(200);

    const rows = rawDb
      .prepare("SELECT * FROM band_follows WHERE email=? AND band_profile_id=?")
      .all("fan@example.com", band.band_profile_id);
    expect(rows.length).toBe(1);
  });

  it("returns 404 if band does not exist", async () => {
    const { env } = createTestEnv();

    const req = new Request("https://example.test/api/bands/99999/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "fan@example.com" }),
    });
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: "99999" }, waitUntil });
    expect(res.status).toBe(404);
  });
});
