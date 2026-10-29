import { describe, it, expect } from "vitest";
import { createTestEnv } from "../../test-utils.js";
import { onRequestPost as verify } from "../verify.js";
import { onRequestPost as subscribe } from "../subscribe.js";
import { hashStoredToken } from "../../../utils/tokens.js";

// The rest of this directory runs on a hand-written MockD1Database that
// pattern-matches SQL text, so the expiry predicate (#1291) was only ever
// checked against the mock's imitation of it. These run the real SQL on the
// real schema (better-sqlite3), where datetime('now', '-7 days') is evaluated
// by SQLite itself.

async function seedPending(rawDb, { email, token, ageDays }) {
  rawDb
    .prepare(
      "INSERT INTO email_subscriptions (email, city, genre, verification_token, unsubscribe_token, verified, created_at) VALUES (?, 'portland', 'punk', ?, ?, 0, datetime('now', ?))",
    )
    .run(email, await hashStoredToken(token), `unsub-${token}`, `-${ageDays} days`);
}

const verifyRequest = (token) =>
  new Request("https://example.test/api/subscriptions/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });

const row = (rawDb, email) =>
  rawDb
    .prepare("SELECT verified, confirmed_at, verification_token FROM email_subscriptions WHERE email = ?")
    .get(email);

describe("subscription confirmation window, real SQLite (#1291)", () => {
  it("refuses a confirmation requested 8 days ago", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "old@example.com", token: "tok-old", ageDays: 8 });

    const res = await verify({ request: verifyRequest("tok-old"), env });

    expect(res.status).not.toBe(303);
    expect(row(rawDb, "old@example.com")).toMatchObject({ verified: 0, confirmed_at: null });
  });

  it("accepts a confirmation requested 6 days ago", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "fresh@example.com", token: "tok-fresh", ageDays: 6 });

    const res = await verify({ request: verifyRequest("tok-fresh"), env });

    expect(res.status).toBe(303);
    expect(row(rawDb, "fresh@example.com").verified).toBe(1);
  });

  // The link can expire between verify.js's lookup and its UPDATE. The lookup
  // is made to miss the window here, so only the UPDATE's own guard and the
  // re-read stand between that click and a false "already verified".
  it("a link that expires between lookup and write is neither confirmed nor called verified", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "race@example.com", token: "tok-race", ageDays: 8 });
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) =>
      prepare(
        sql.includes("SELECT id, email, city, genre, verified")
          ? sql.replace("AND (verified = 1 OR (verified = 0 AND created_at >= datetime('now', '-7 days')))", "")
          : sql,
      );

    const res = await verify({ request: verifyRequest("tok-race"), env });

    expect(row(rawDb, "race@example.com")).toMatchObject({ verified: 0, confirmed_at: null });
    expect(res.status).toBe(410);
    expect(await res.text()).not.toMatch(/already verified/i);
  });

  // Two re-subscribes race on the same expired row: the other request deletes
  // it and inserts a fresh one between this request's lookup and its DELETE.
  // The re-send must carry the token stored NOW, not the stale one it read.
  it("a re-send after a concurrent re-subscribe carries the current token", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "racer@example.com", token: "tok-stale", ageDays: 8 });
    const currentHash = await hashStoredToken("tok-current");
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("DELETE FROM email_subscriptions") && sql.includes("WHERE id = ?")) {
        rawDb.prepare("DELETE FROM email_subscriptions WHERE email = 'racer@example.com'").run();
        rawDb
          .prepare(
            "INSERT INTO email_subscriptions (email, city, genre, verification_token, unsubscribe_token, verified, created_at) VALUES (?, 'portland', 'punk', ?, ?, 0, datetime('now'))",
          )
          .run("racer@example.com", currentHash, "unsub-tok-current");
      }
      return prepare(sql);
    };

    const res = await subscribe({
      request: new Request("https://example.test/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
        body: JSON.stringify({ email: "racer@example.com", city: "portland", genre: "punk", frequency: "weekly" }),
      }),
      env,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const currentToken = new URL(body.verificationUrl).searchParams.get("token");
    expect(
      rawDb.prepare("SELECT verification_token FROM email_subscriptions WHERE email = ?").get("racer@example.com")
        .verification_token,
    ).toBe(await hashStoredToken(currentToken));
    expect(body.verificationUrl).not.toContain("tok-stale");
  });

  // The other two outcomes of the same race: the concurrent request has left
  // the address VERIFIED, or has left no row at all. A wrong check on the
  // re-read row would mis-answer one of them while the case above still passed.
  const raceOnDelete = (env, swap) => {
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("DELETE FROM email_subscriptions") && sql.includes("WHERE id = ?")) swap();
      return prepare(sql);
    };
  };
  const resubscribe = (email, env) =>
    subscribe({
      request: new Request("https://example.test/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
        body: JSON.stringify({ email, city: "portland", genre: "punk", frequency: "weekly" }),
      }),
      env,
    });

  it("a row verified concurrently answers 'already subscribed' and is left verified", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "verified-race@example.com", token: "tok-stale", ageDays: 8 });
    raceOnDelete(env, () =>
      rawDb
        .prepare(
          "UPDATE email_subscriptions SET verified = 1, verification_token = NULL, created_at = datetime('now') WHERE email = 'verified-race@example.com'",
        )
        .run(),
    );

    const res = await resubscribe("verified-race@example.com", env);

    expect(res.status).toBe(400);
    expect(row(rawDb, "verified-race@example.com")).toMatchObject({ verified: 1, verification_token: null });
  });

  it("a row deleted concurrently falls through to a fresh subscription", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "gone-race@example.com", token: "tok-stale", ageDays: 8 });
    raceOnDelete(env, () =>
      rawDb.prepare("DELETE FROM email_subscriptions WHERE email = 'gone-race@example.com'").run(),
    );

    const res = await resubscribe("gone-race@example.com", env);

    expect(res.status).toBe(201);
    const rows = rawDb
      .prepare("SELECT verified, verification_token FROM email_subscriptions WHERE email = 'gone-race@example.com'")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ verified: 0 });
    expect(rows[0].verification_token).not.toBe("tok-stale");
  });

  it("re-subscribing after expiry issues a fresh token; a verified row is never replaced", async () => {
    const { env, rawDb } = createTestEnv();
    await seedPending(rawDb, { email: "again@example.com", token: "tok-stale", ageDays: 8 });
    rawDb
      .prepare(
        "INSERT INTO email_subscriptions (email, city, genre, verification_token, unsubscribe_token, verified, created_at) VALUES ('kept@example.com', 'portland', 'punk', NULL, 'unsub-kept', 1, datetime('now', '-400 days'))",
      )
      .run();

    const statuses = {};
    for (const email of ["again@example.com", "kept@example.com"]) {
      const res = await subscribe({
        request: new Request("https://example.test/api/subscriptions/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
          body: JSON.stringify({ email, city: "portland", genre: "punk", frequency: "weekly" }),
        }),
        env,
      });
      statuses[email] = res.status;
    }
    expect(statuses["again@example.com"]).toBe(201);
    // An already-verified address keeps today's answer: "already subscribed".
    expect(statuses["kept@example.com"]).toBe(400);

    const again = rawDb
      .prepare("SELECT verified, verification_token FROM email_subscriptions WHERE email = 'again@example.com'")
      .all();
    expect(again).toHaveLength(1);
    expect(again[0].verified).toBe(0);
    expect(again[0].verification_token).not.toBe("tok-stale");

    expect(row(rawDb, "kept@example.com").verified).toBe(1);
  });
});
