import { createHash } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";
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
let providerDown;

function setup() {
  sent = [];
  providerDown = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (new URL(String(url)).hostname === "api.resend.com") {
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
  return ctx;
}

const post = (path, body, ip) =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });

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

  it("resend-activation: the 6th request from a fresh IP sends nothing and answers like the 1st", async () => {
    const { env, rawDb } = setup();
    insertInactiveUser(rawDb, "victim@example.com");
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await resend(env, "victim@example.com", `203.0.113.${i + 1}`));
    expect(sent).toHaveLength(5);
    expect(results[5]).toEqual(results[0]);
  });

  it("a different address is unaffected", async () => {
    const { env, rawDb } = setup();
    insertInactiveUser(rawDb, "victim@example.com");
    insertInactiveUser(rawDb, "other@example.com");
    for (let i = 0; i < 6; i++) await resend(env, "victim@example.com", `203.0.113.${i + 1}`);
    await resend(env, "other@example.com", "198.51.100.9");
    expect(sent.filter((to) => to === "other@example.com")).toHaveLength(1);
  });

  it("is case- and whitespace-insensitive about the address", async () => {
    const { env } = setup();
    for (let i = 0; i < 5; i++) await allowEmailToRecipient(env.DB, "victim@example.com");
    expect(await allowEmailToRecipient(env.DB, "  VICTIM@Example.com ")).toMatchObject({ allowed: false });
  });

  it("resend-activation: suppressed, same body, and the held activation link is not rotated", async () => {
    const { env, rawDb } = setup();
    insertInactiveUser(rawDb, "newhire@example.com");
    const first = await resend(env, "newhire@example.com", "203.0.113.1");
    const tokenAfterFirst = rawDb
      .prepare("SELECT activation_token FROM users WHERE email = ?")
      .get("newhire@example.com");
    for (let i = 0; i < 4; i++) await allowEmailToRecipient(env.DB, "newhire@example.com");

    const capped = await resend(env, "newhire@example.com", "203.0.113.200");
    expect(sent).toHaveLength(1);
    expect(capped).toEqual(first);
    const tokenAfterCap = rawDb
      .prepare("SELECT activation_token FROM users WHERE email = ?")
      .get("newhire@example.com");
    expect(tokenAfterCap.activation_token).toBe(tokenAfterFirst.activation_token);
  });

  it("never stores the raw address in rate_limits", async () => {
    const { env, rawDb } = setup();
    insertInactiveUser(rawDb, "secret.person@example.com");
    await resend(env, "secret.person@example.com", "203.0.113.1");
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
    const { env, rawDb } = setup();
    insertInactiveUser(rawDb, "logme@example.com");
    for (let i = 0; i < 6; i++) await resend(env, "logme@example.com", `203.0.113.${i + 1}`);
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

  it("resend-activation sends nothing, and still answers normally, when the counter table is broken", async () => {
    const { env, rawDb } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    insertInactiveUser(rawDb, "x@example.com");
    rawDb.exec("DROP TABLE rate_limits");
    const res = await resend(env, "x@example.com", "203.0.113.1");
    expect(res.body.success).toBe(true);
    expect(sent).toHaveLength(0);
    // An outage is logged as an outage at error level, never as "cap reached".
    const errors = console.error.mock.calls.flat().join(" ");
    expect(errors).toContain("Recipient cap unavailable");
    expect(errors).toContain("fail-closed");
    expect(errors).not.toContain("x@example.com");
    expect(console.warn.mock.calls.flat().join(" ")).not.toContain("cap reached");
    // Nor the full digest: unsalted, it is a stable pseudonym a log reader could
    // test known addresses against. Only the 8-char id may appear. Serialised,
    // because the logger passes objects, which join() would print as [object Object].
    const digest = createHash("sha256").update("x@example.com").digest("hex");
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(digest);
    expect(JSON.stringify(console.error.mock.calls)).toContain(digest.slice(0, 8));
  });

  it("a real over-cap is a warning, not an error, and reports reason 'capped'", async () => {
    const { env, rawDb } = setup();
    insertInactiveUser(rawDb, "victim@example.com");
    for (let i = 0; i < 6; i++) await resend(env, "victim@example.com", `203.0.113.${i + 1}`);
    expect(console.warn.mock.calls.flat().join(" ")).toContain("cap reached");
    expect(console.error.mock.calls.flat().join(" ")).not.toContain("Recipient cap unavailable");
    for (let i = 0; i < 5; i++) await allowEmailToRecipient(env.DB, "z@example.com");
    expect(await allowEmailToRecipient(env.DB, "z@example.com")).toMatchObject({ allowed: false, reason: "capped" });
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
