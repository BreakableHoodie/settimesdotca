import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestEnv, insertBand, insertEvent } from "../../api/test-utils.js";
import * as followHandler from "../../api/bands/[name]/follow.js";
import * as followBatchHandler from "../../api/bands/follow-batch.js";
import * as subscribeHandler from "../../api/subscriptions/subscribe.js";
import * as resendHandler from "../../api/auth/resend-activation.js";
import { runRetentionCleanup } from "../../api/admin/maintenance/retention.js";
import {
  allowEmailToRecipient,
  RECIPIENT_EMAIL_CAP,
  RECIPIENT_KEY_PREFIX,
  recipientLogId,
} from "../recipientEmailCap.js";

// Per-recipient email cap (#1337). Real SQLite and the real senders, with fetch stubbed at
// the email provider so "an email was sent" means the provider was actually called.

let sent;
let pending;
let providerDown;
const waitUntil = (p) => pending.push(p);

function setup() {
  sent = [];
  pending = [];
  providerDown = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (String(url).includes("api.resend.com")) {
        if (providerDown) return new Response("boom", { status: 500 });
        sent.push(...[JSON.parse(init.body).to].flat());
        return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  const ctx = createTestEnv();
  Object.assign(ctx.env, { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", EMAIL_FROM: "noreply@example.test" });
  const ev = insertEvent(ctx.rawDb, { name: "Cap", slug: "cap-ev", status: "published" });
  const bands = Array.from({ length: 8 }, (_, i) => insertBand(ctx.rawDb, { name: `Cap Band ${i}`, event_id: ev.id }));
  return { ...ctx, bands };
}

const post = (path, body, ip) =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });

async function follow(env, band, email, ip) {
  const res = await followHandler.onRequestPost({
    request: post(`/api/bands/${band.band_profile_id}/follow`, { email }, ip),
    env,
    params: { name: String(band.band_profile_id) },
    waitUntil,
  });
  await Promise.all(pending);
  return { status: res.status, body: await res.json() };
}

async function batch(env, bands, email, ip) {
  const res = await followBatchHandler.onRequestPost({
    request: post("/api/bands/follow-batch", { email, performance_ids: bands.map((b) => b.id) }, ip),
    env,
    waitUntil,
  });
  await Promise.all(pending);
  return { status: res.status, body: await res.json() };
}

async function subscribe(env, email, genre, ip) {
  const res = await subscribeHandler.onRequestPost({
    request: post("/api/subscriptions/subscribe", { email, city: "waterloo", genre }, ip),
    env,
  });
  return { status: res.status, body: await res.json() };
}

async function resend(env, email, ip) {
  const res = await resendHandler.onRequestPost({ request: post("/api/auth/resend-activation", { email }, ip), env });
  return { status: res.status, body: await res.json() };
}

function insertInactiveUser(rawDb, email) {
  rawDb
    .prepare(
      "INSERT INTO users (email, password_hash, name, role, is_active, activated_at) VALUES (?, 'h', 'N', 'editor', 0, NULL)",
    )
    .run(email);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("per-recipient email cap (#1337)", () => {
  it("is 5 per address", () => {
    expect(RECIPIENT_EMAIL_CAP).toBe(5);
  });

  it("follow: the 6th request from a fresh IP sends nothing and answers like the 1st", async () => {
    const { env, rawDb, bands } = setup();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await follow(env, bands[i], "victim@example.com", `203.0.113.${i + 1}`));

    expect(sent).toHaveLength(5);
    expect(results[5]).toEqual(results[0]);
    expect(results[5].status).toBe(200);
    // The capped follow leaves no unmailed pending row behind.
    const rows = rawDb.prepare("SELECT band_profile_id FROM band_follows WHERE email = ?").all("victim@example.com");
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.band_profile_id === bands[5].band_profile_id)).toBe(false);
  });

  it("a different address is unaffected", async () => {
    const { env, bands } = setup();
    for (let i = 0; i < 6; i++) await follow(env, bands[i], "victim@example.com", `203.0.113.${i + 1}`);
    await follow(env, bands[6], "other@example.com", "198.51.100.9");
    expect(sent.filter((to) => to === "other@example.com")).toHaveLength(1);
  });

  it("is case- and whitespace-insensitive about the address", async () => {
    const { env, bands } = setup();
    for (let i = 0; i < 5; i++) await follow(env, bands[i], "victim@example.com", `203.0.113.${i + 1}`);
    await follow(env, bands[5], "  VICTIM@Example.com ", "203.0.113.50");
    expect(sent).toHaveLength(5);
  });

  it("a no-op follow does not burn the cap", async () => {
    const { env, bands } = setup();
    for (let i = 0; i < 10; i++) await follow(env, bands[0], "again@example.com", `203.0.113.${i + 1}`);
    expect(sent).toHaveLength(1);
    for (let i = 1; i < 5; i++) await follow(env, bands[i], "again@example.com", `203.0.113.${i + 20}`);
    expect(sent).toHaveLength(5);
  });

  it("a capped follow can be retried once the window has passed (no stuck pending row)", async () => {
    const { env, rawDb, bands } = setup();
    for (let i = 0; i < 6; i++) await follow(env, bands[i], "victim@example.com", `203.0.113.${i + 1}`);
    rawDb.prepare("DELETE FROM rate_limits").run();
    await follow(env, bands[5], "victim@example.com", "203.0.113.99");
    expect(sent).toHaveLength(6);
  });

  it("follow-batch: the 6th email is suppressed with an identical response, and one batch costs one", async () => {
    const { env, rawDb, bands } = setup();
    const first = await batch(env, bands.slice(0, 3), "victim@example.com", "203.0.113.1");
    const counter = rawDb.prepare("SELECT count FROM rate_limits WHERE key LIKE 'email-recipient:%'").get();
    expect(counter.count).toBe(1);
    for (let i = 3; i < 7; i++) await follow(env, bands[i], "victim@example.com", `203.0.113.${i + 1}`);
    expect(sent).toHaveLength(5);
    const capped = await batch(env, [bands[7]], "victim@example.com", "203.0.113.77");
    expect(sent).toHaveLength(5);
    expect(capped).toEqual(first);
    expect(
      rawDb
        .prepare("SELECT 1 FROM band_follows WHERE email = ? AND band_profile_id = ?")
        .get("victim@example.com", bands[7].band_profile_id),
    ).toBeUndefined();
  });

  it("subscribe: the 6th request sends nothing and answers like the 1st", async () => {
    const { env, rawDb } = setup();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await subscribe(env, "victim@example.com", `g${i}`, `203.0.113.${i + 1}`));
    expect(sent).toHaveLength(5);
    expect(results[5]).toEqual(results[0]);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS n FROM email_subscriptions WHERE email = ?").get("victim@example.com").n,
    ).toBe(5);
  });

  it("resend-activation: suppressed, same body, and the held activation link is not rotated", async () => {
    const { env, rawDb, bands } = setup();
    insertInactiveUser(rawDb, "newhire@example.com");
    const first = await resend(env, "newhire@example.com", "203.0.113.1");
    const tokenAfterFirst = rawDb
      .prepare("SELECT activation_token FROM users WHERE email = ?")
      .get("newhire@example.com");
    for (let i = 0; i < 4; i++) await follow(env, bands[i], "newhire@example.com", `203.0.113.${i + 2}`);
    expect(sent).toHaveLength(5);

    const capped = await resend(env, "newhire@example.com", "203.0.113.200");
    expect(sent).toHaveLength(5);
    expect(capped).toEqual(first);
    const tokenAfterCap = rawDb
      .prepare("SELECT activation_token FROM users WHERE email = ?")
      .get("newhire@example.com");
    expect(tokenAfterCap.activation_token).toBe(tokenAfterFirst.activation_token);
  });

  it("mixed senders share ONE cap: 3 follows + 2 subscribes, then resend-activation is suppressed", async () => {
    const { env, rawDb, bands } = setup();
    insertInactiveUser(rawDb, "mixed@example.com");
    for (let i = 0; i < 3; i++) await follow(env, bands[i], "mixed@example.com", `203.0.113.${i + 1}`);
    for (let i = 0; i < 2; i++) await subscribe(env, "mixed@example.com", `g${i}`, `203.0.113.${i + 10}`);
    expect(sent).toHaveLength(5);

    await resend(env, "mixed@example.com", "203.0.113.99");
    expect(sent).toHaveLength(5);
  });

  it("never stores the raw address in rate_limits", async () => {
    const { env, rawDb, bands } = setup();
    await follow(env, bands[0], "secret.person@example.com", "203.0.113.1");
    const keys = rawDb
      .prepare("SELECT key FROM rate_limits WHERE key LIKE 'email-recipient:%'")
      .all()
      .map((r) => r.key);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^email-recipient:[0-9a-f]{64}$/);
    for (const { key } of rawDb.prepare("SELECT key FROM rate_limits").all()) {
      expect(key).not.toContain("secret");
      expect(key).not.toContain("example.com");
    }
    expect(await recipientLogId("secret.person@example.com")).toBe(
      keys[0].slice(RECIPIENT_KEY_PREFIX.length, RECIPIENT_KEY_PREFIX.length + 8),
    );
  });

  it("logs only the hash prefix, never the address", async () => {
    const { env, bands } = setup();
    for (let i = 0; i < 6; i++) await follow(env, bands[i], "logme@example.com", `203.0.113.${i + 1}`);
    const logged = console.warn.mock.calls.flat().join(" ");
    expect(logged).toContain("cap reached");
    expect(logged).not.toContain("logme");
  });

  it("fails closed when the counter cannot be written", async () => {
    const failingDb = {
      prepare() {
        throw new Error("D1 down");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await allowEmailToRecipient(failingDb, "a@example.com")).toMatchObject({
      allowed: false,
      reason: "counter_unavailable",
    });
  });

  it("a sender sends nothing, and still answers normally, when the counter table is broken", async () => {
    const { env, rawDb, bands } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    rawDb.exec("DROP TABLE rate_limits");
    const res = await follow(env, bands[0], "x@example.com", "203.0.113.1");
    expect(res).toEqual({ status: 200, body: { success: true } });
    expect(sent).toHaveLength(0);
    // An outage is logged as an outage at error level, never as "cap reached".
    const errors = console.error.mock.calls.flat().join(" ");
    expect(errors).toContain("Recipient cap unavailable");
    expect(errors).toContain("fail-closed");
    expect(errors).not.toContain("x@example.com");
    expect(console.warn.mock.calls.flat().join(" ")).not.toContain("cap reached");
  });

  it("a real over-cap is a warning, not an error, and reports reason 'capped'", async () => {
    const { env, bands } = setup();
    for (let i = 0; i < 6; i++) await follow(env, bands[i], "victim@example.com", `203.0.113.${i + 1}`);
    expect(console.warn.mock.calls.flat().join(" ")).toContain("cap reached");
    expect(console.error.mock.calls.flat().join(" ")).not.toContain("Recipient cap unavailable");
    for (let i = 0; i < 5; i++) await allowEmailToRecipient(env.DB, "z@example.com");
    expect(await allowEmailToRecipient(env.DB, "z@example.com")).toMatchObject({ allowed: false, reason: "capped" });
  });

  it("counter outage gives the same response on every sender", async () => {
    const { env, rawDb, bands } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    insertInactiveUser(rawDb, "outage@example.com");
    const ok = await subscribe(env, "fine@example.com", "g0", "203.0.113.1");
    rawDb.exec("DROP TABLE rate_limits");
    expect(await subscribe(env, "outage@example.com", "g0", "203.0.113.2")).toEqual(ok);
    expect((await batch(env, bands.slice(0, 2), "outage@example.com", "203.0.113.3")).body).toEqual({ success: true });
    expect((await resend(env, "outage@example.com", "203.0.113.4")).body.success).toBe(true);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follows").get().n).toBe(0);
    expect(
      rawDb.prepare("SELECT activation_token FROM users WHERE email = ?").get("outage@example.com").activation_token,
    ).toBeNull();
    expect(sent).toHaveLength(1);
  });
});

describe("an unmailed pending row never blocks a re-request", () => {
  it("follow: a provider failure leaves no row, and an immediate re-request sends again", async () => {
    const { env, rawDb, bands } = setup();
    providerDown = true;
    const first = await follow(env, bands[0], "flaky@example.com", "203.0.113.1");
    expect(first.status).toBe(200);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follows WHERE email = ?").get("flaky@example.com").n).toBe(0);
    providerDown = false;
    await follow(env, bands[0], "flaky@example.com", "203.0.113.2");
    expect(sent).toEqual(["flaky@example.com"]);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follows WHERE email = ?").get("flaky@example.com").n).toBe(1);
  });

  it("follow: a thrown send also leaves no row", async () => {
    const { env, rawDb, bands } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await follow(env, bands[0], "throws@example.com", "203.0.113.1");
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follows WHERE email = ?").get("throws@example.com").n).toBe(0);
  });

  it("follow-batch: a provider failure leaves no rows, and an immediate re-request sends again", async () => {
    const { env, rawDb, bands } = setup();
    providerDown = true;
    await batch(env, bands.slice(0, 3), "flaky@example.com", "203.0.113.1");
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follows WHERE email = ?").get("flaky@example.com").n).toBe(0);
    providerDown = false;
    await batch(env, bands.slice(0, 3), "flaky@example.com", "203.0.113.2");
    expect(sent).toEqual(["flaky@example.com"]);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_follows WHERE email = ?").get("flaky@example.com").n).toBe(3);
  });

  it("subscribe: a provider failure leaves no row, and an immediate re-request sends again", async () => {
    const { env, rawDb } = setup();
    providerDown = true;
    await subscribe(env, "flaky@example.com", "g0", "203.0.113.1");
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM email_subscriptions").get().n).toBe(0);
    providerDown = false;
    const again = await subscribe(env, "flaky@example.com", "g0", "203.0.113.2");
    expect(again.status).toBe(201);
    expect(sent).toEqual(["flaky@example.com"]);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM email_subscriptions").get().n).toBe(1);
  });

  it("a request that would be a no-op does not spend the allowance (pre-read)", async () => {
    const { env, rawDb, bands } = setup();
    await follow(env, bands[0], "once@example.com", "203.0.113.1");
    await follow(env, bands[0], "once@example.com", "203.0.113.2");
    await batch(env, [bands[0]], "once@example.com", "203.0.113.3");
    const row = rawDb.prepare("SELECT count FROM rate_limits WHERE key LIKE 'email-recipient:%'").get();
    expect(row.count).toBe(1);
  });
});

describe("recipient counters outlive the generic 30-minute prune (#1337)", () => {
  it("keeps an email-recipient counter for 25 h but still prunes other counters at 30 min", async () => {
    const { env, rawDb } = setup();
    const now = Math.floor(Date.now() / 1000);
    const ins = rawDb.prepare("INSERT INTO rate_limits (key, count, window_start, updated_at) VALUES (?, 3, ?, ?)");
    ins.run("email-recipient:aaa", now - 24 * 3600, now - 24 * 3600); // 24 h idle: kept
    ins.run("email-recipient:bbb", now - 26 * 3600, now - 26 * 3600); // 26 h idle: pruned
    ins.run("1.2.3.4:/api/auth/x", now - 3600, now - 3600); // generic, 1 h idle: pruned
    ins.run("5.6.7.8:/api/auth/x", now - 60, now - 60); // generic, fresh: kept
    await runRetentionCleanup(env);
    const keys = rawDb
      .prepare("SELECT key FROM rate_limits ORDER BY key")
      .all()
      .map((r) => r.key);
    expect(keys).toEqual(["5.6.7.8:/api/auth/x", "email-recipient:aaa"]);
  });
});
