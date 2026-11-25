import { describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import * as activateHandler from "../activate.js";
import { toSqliteDateTime } from "../../../utils/authAttempts.js";
import { hashStoredToken } from "../../../utils/tokens.js";
import * as resendActivationHandler from "../resend-activation.js";

const BASE_URL = "https://example.test/api/auth/activate";

// Captures the activation link the handler actually emails (Resend stubbed at
// fetch), so the round trip redeems what the user receives, not a value the
// test derived itself.
function captureActivationEmails(env) {
  const tokens = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (new URL(String(url)).hostname === "api.resend.com") {
        const { text } = JSON.parse(init.body);
        const link = text.match(/https?:\/\/\S+\/activate\?\S+/)?.[0];
        if (link) tokens.push(new URL(link).searchParams.get("token"));
        return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }),
  );
  Object.assign(env, { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", EMAIL_FROM: "noreply@example.test" });
  return tokens;
}

// The column holds the digest (#1482); tests submit the plaintext.
async function insertPendingUser(rawDb, { email = "pending@example.com", token = "tok-123", expiresAt } = {}) {
  const stored = await hashStoredToken(token);
  rawDb
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activation_token_expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(email, "hash", "Pending User", "editor", stored, expiresAt);
  return rawDb.prepare("SELECT id FROM users WHERE email = ?").get(email);
}

function activateRequest(token) {
  return new Request(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

describe("POST /api/auth/activate — expiry guards fail closed", () => {
  it("rejects a malformed activation_token_expires_at instead of failing open", async () => {
    // Before the fix BOTH layers failed open on this input:
    //   JS  — `new Date("not-a-date") < new Date()` is FALSE ("not expired")
    //   SQL — a raw text compare of 'not-a-date' >= datetime('now') is TRUE,
    //         since 'n' (0x6E) sorts above '2' (0x32)
    // so a garbage expiry produced a permanently valid activation token.
    // fromSqliteDateTime() now returns null for unparseable input and the
    // caller treats null as expired; datetime() yields NULL in SQL so the
    // UPDATE matches no row.
    const { env, rawDb } = createTestEnv();
    await insertPendingUser(rawDb, { expiresAt: "not-a-date" });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(400);
    const user = rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com");
    expect(user.is_active).toBe(0);
  });

  it("the atomic SQL guard normalises legacy ISO-'T' expiries (raw text compare is wrong on the expiry date)", () => {
    // The handler's JS check catches this first, so it is not observable
    // end-to-end — but the SQL predicate is the atomic race guard behind that
    // check, and it was independently broken for rows written before the
    // SEC-F1 write-side fix. On the expiry DATE itself, 'T' (0x54) sorts above
    // ' ' (0x20), so an already-expired legacy row compared as still valid.
    // This asserts the predicate directly.
    const { rawDb } = createTestEnv();
    const expiredLegacy = "2026-07-29T10:00:00.000Z"; // expired at 10:00
    const laterSameDay = "2026-07-29 23:00:00"; // now: 23:00, same day

    const raw = rawDb.prepare("SELECT ? >= ? AS pass").get(expiredLegacy, laterSameDay);
    const normalised = rawDb.prepare("SELECT datetime(?) >= datetime(?) AS pass").get(expiredLegacy, laterSameDay);

    expect(raw.pass).toBe(1); // the bug: expired token would pass
    expect(normalised.pass).toBe(0); // the fix: correctly rejected
  });

  it("SQL guard alone rejects an expired legacy-format token, independent of the JS check", async () => {
    // The test above proves datetime() normalisation is necessary in the
    // abstract; this exercises the ACTUAL query in activate.js:98, not a
    // hand-copied comparison. The JS check normally intercepts an expired
    // token first, so the SQL guard is otherwise never end-to-end
    // observable — stub fromSqliteDateTime to always report "not expired" so
    // the real UPDATE predicate is the only remaining line of defense.
    vi.resetModules();
    vi.doMock("../../../utils/authAttempts.js", async () => {
      const actual = await vi.importActual("../../../utils/authAttempts.js");
      return { ...actual, fromSqliteDateTime: () => new Date(Date.now() + 60 * 60 * 1000) };
    });

    try {
      const { onRequestPost } = await import("../activate.js");

      const { env, rawDb } = createTestEnv();
      const expiredLegacy = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // expired, legacy 'T'+'Z' format
      await insertPendingUser(rawDb, { expiresAt: expiredLegacy });

      const response = await onRequestPost({ request: activateRequest("tok-123"), env });

      expect(response.status).toBe(400);
      const user = rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com");
      expect(user.is_active).toBe(0);
    } finally {
      vi.doUnmock("../../../utils/authAttempts.js");
      vi.resetModules();
    }
  });
});

describe("POST /api/auth/activate", () => {
  it("activates a pending user with a valid, non-expired (SQLite-format) token", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = toSqliteDateTime(new Date(Date.now() + 60 * 60 * 1000)); // 1h from now
    await insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(200);
    const user = rawDb
      .prepare("SELECT is_active, activated_at, activation_token FROM users WHERE email = ?")
      .get("pending@example.com");
    expect(user.is_active).toBe(1);
    expect(user.activated_at).toBeTruthy();
    expect(user.activation_token).toBeNull();
  });

  it("rejects a token whose activation_token_expires_at (SQLite format) is in the past — TZ-parsing regression guard", async () => {
    // A bare `new Date(value)` falls back to LOCAL-time parsing for a
    // space-separated, 'Z'-less SQLite datetime string. On a host whose local
    // time IS UTC (e.g. a UTC-configured CI runner — a common default), local
    // parsing and UTC parsing produce identical results, so that regression
    // would be silently invisible if this test ran under the runner's ambient
    // TZ. Pin a non-UTC zone for the duration of this test so the local/UTC
    // distinction is always exercised, regardless of the runner's default.
    vi.stubEnv("TZ", "America/Toronto");
    try {
      const { env, rawDb } = createTestEnv();
      const expiresAt = toSqliteDateTime(new Date(Date.now() - 60 * 60 * 1000)); // 1h ago
      await insertPendingUser(rawDb, { expiresAt });

      const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.error).toBe("Activation link expired");

      const user = rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com");
      expect(user.is_active).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still activates a valid, non-expired LEGACY ISO ('T'+'Z') token (backward compat, no migration needed)", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(200);
  });

  it("still rejects an expired LEGACY ISO ('T'+'Z') token (backward compat)", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(400);
  });

  it("rejects an unknown token", async () => {
    const { env } = createTestEnv();

    const response = await activateHandler.onRequestPost({ request: activateRequest("no-such-token"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Invalid or expired token");
  });

  it("rejects an already-activated account", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb
      .prepare(
        `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activation_token_expires_at, activated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now'))`,
      )
      .run(
        "already@example.com",
        "hash",
        "Already Active",
        "editor",
        await hashStoredToken("tok-already"),
        toSqliteDateTime(new Date(Date.now() + 60 * 60 * 1000)),
      );

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-already"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Already activated");
  });
});

describe("POST /api/auth/activate — tokens are stored hashed (#1482)", () => {
  const future = () => toSqliteDateTime(new Date(Date.now() + 60 * 60 * 1000));

  it("the stored value is not redeemable: submitting the digest itself is refused", async () => {
    const { env, rawDb } = createTestEnv();
    await insertPendingUser(rawDb, { expiresAt: future() });
    const stored = rawDb.prepare("SELECT activation_token FROM users WHERE email = ?").get("pending@example.com");
    expect(stored.activation_token).toMatch(/^sha256:[0-9a-f]{64}$/);

    const response = await activateHandler.onRequestPost({ request: activateRequest(stored.activation_token), env });

    expect(response.status).toBe(400);
    const user = rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com");
    expect(user.is_active).toBe(0);
  });

  it("a plaintext token left in the column (pre-migration) is not redeemable", async () => {
    const { env, rawDb } = createTestEnv();
    rawDb
      .prepare(
        `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activation_token_expires_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run("legacy@example.com", "hash", "Legacy", "editor", "plain-legacy-token", future());

    const response = await activateHandler.onRequestPost({ request: activateRequest("plain-legacy-token"), env });

    expect(response.status).toBe(400);
    expect(rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("legacy@example.com").is_active).toBe(0);
  });

  it("a token with NO expiry is refused, not treated as never expiring", async () => {
    const { env, rawDb } = createTestEnv();
    await insertPendingUser(rawDb, { expiresAt: null });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(400);
    // Refused by the JS check, not only by the SQL guard behind it.
    expect((await response.json()).error).toBe("Activation link expired");
    expect(rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com").is_active).toBe(0);
  });

  it("the SQL guard alone refuses a NULL expiry, independent of the JS check", async () => {
    vi.resetModules();
    vi.doMock("../../../utils/authAttempts.js", async () => {
      const actual = await vi.importActual("../../../utils/authAttempts.js");
      return { ...actual, fromSqliteDateTime: () => new Date(Date.now() + 60 * 60 * 1000) };
    });
    try {
      const { onRequestPost } = await import("../activate.js");
      const { env, rawDb } = createTestEnv();
      await insertPendingUser(rawDb, { expiresAt: null });

      const response = await onRequestPost({ request: activateRequest("tok-123"), env });

      expect(response.status).toBe(400);
      expect(rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com").is_active).toBe(0);
    } finally {
      vi.doUnmock("../../../utils/authAttempts.js");
      vi.resetModules();
    }
  });

  it("resend-activation stores only the digest, and the emailed link activates the account", async () => {
    const { env, rawDb } = createTestEnv();
    const emailed = captureActivationEmails(env);
    rawDb
      .prepare(
        "INSERT INTO users (email, password_hash, name, role, is_active, activated_at) VALUES (?, ?, ?, ?, 0, NULL)",
      )
      .run("roundtrip@example.com", "hash", "Round Trip", "editor");
    try {
      const response = await resendActivationHandler.onRequestPost({
        request: new Request("https://example.test/api/auth/resend-activation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "roundtrip@example.com" }),
        }),
        env,
      });
      expect(response.status).toBe(200);
      expect(emailed).toHaveLength(1);
      const [plaintext] = emailed;

      const stored = rawDb.prepare("SELECT activation_token FROM users WHERE email = ?").get("roundtrip@example.com");
      expect(stored.activation_token).not.toBe(plaintext);
      expect(stored.activation_token).toBe(await hashStoredToken(plaintext));

      const activated = await activateHandler.onRequestPost({ request: activateRequest(plaintext), env });
      expect(activated.status).toBe(200);
      const user = rawDb
        .prepare("SELECT is_active, activation_token FROM users WHERE email = ?")
        .get("roundtrip@example.com");
      expect(user.is_active).toBe(1);
      expect(user.activation_token).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
