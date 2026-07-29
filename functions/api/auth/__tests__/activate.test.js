import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import * as activateHandler from "../activate.js";
import { toSqliteDateTime } from "../../../utils/authAttempts.js";

const BASE_URL = "https://example.test/api/auth/activate";

function insertPendingUser(rawDb, { email = "pending@example.com", token = "tok-123", expiresAt } = {}) {
  rawDb
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activation_token_expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(email, "hash", "Pending User", "editor", token, expiresAt);
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
    insertPendingUser(rawDb, { expiresAt: "not-a-date" });

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
});

describe("POST /api/auth/activate", () => {
  it("activates a pending user with a valid, non-expired (SQLite-format) token", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = toSqliteDateTime(new Date(Date.now() + 60 * 60 * 1000)); // 1h from now
    insertPendingUser(rawDb, { expiresAt });

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
    // This is the exact bug the SEC-F1 write-side fix (#670) introduced and
    // fromSqliteDateTime() (authAttempts.js) fixes: activation_token_expires_at
    // no longer carries a 'Z' suffix once written via toSqliteDateTime(), so a
    // bare `new Date(value)` falls back to LOCAL-time parsing instead of UTC.
    // On a UTC-negative host that silently shifts the parsed instant LATER,
    // which could let an already-expired token still validate. Using an
    // expiry only 1 HOUR in the past (not e.g. 2 days) makes this sensitive
    // to exactly that class of drift, not just a gross date-prefix mismatch.
    const { env, rawDb } = createTestEnv();
    const expiresAt = toSqliteDateTime(new Date(Date.now() - 60 * 60 * 1000)); // 1h ago
    insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Activation link expired");

    const user = rawDb.prepare("SELECT is_active FROM users WHERE email = ?").get("pending@example.com");
    expect(user.is_active).toBe(0);
  });

  it("still activates a valid, non-expired LEGACY ISO ('T'+'Z') token (backward compat, no migration needed)", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    insertPendingUser(rawDb, { expiresAt });

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-123"), env });

    expect(response.status).toBe(200);
  });

  it("still rejects an expired LEGACY ISO ('T'+'Z') token (backward compat)", async () => {
    const { env, rawDb } = createTestEnv();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    insertPendingUser(rawDb, { expiresAt });

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
        `INSERT INTO users (email, password_hash, name, role, is_active, activation_token, activated_at)
         VALUES (?, ?, ?, ?, 1, ?, datetime('now'))`,
      )
      .run("already@example.com", "hash", "Already Active", "editor", "tok-already");

    const response = await activateHandler.onRequestPost({ request: activateRequest("tok-already"), env });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Already activated");
  });
});
