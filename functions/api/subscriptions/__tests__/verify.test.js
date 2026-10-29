import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestGet, onRequestPost } from "../verify.js";
import { MockD1Database } from "./mocks/d1.js";
import { createMockContext } from "./helpers.js";
import { hashStoredToken } from "../../../utils/tokens.js";

describe("/api/subscriptions/verify", () => {
  let mockDB;
  let mockContext;

  beforeEach(() => {
    mockDB = new MockD1Database();
    mockContext = createMockContext(mockDB);

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET renders a confirmation form without verifying, then POST verifies the subscription", async () => {
    // Pre-populate with unverified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: false,
      verification_token: await hashStoredToken("valid-token-12345"),
      unsubscribe_token: "unsub-token-67890",
      created_at: new Date().toISOString(),
    });

    const request = new Request("http://localhost/api/subscriptions/verify?token=valid-token-12345");
    mockContext.request = request;

    const getResponse = await onRequestGet(mockContext);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toContain('method="post"');
    expect(mockDB.data.email_subscriptions[0].verified).toBe(false);

    mockContext.request = new Request("http://localhost/api/subscriptions/verify?token=valid-token-12345", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "valid-token-12345" }),
    });
    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(303);
    const subscription = mockDB.data.email_subscriptions.find((sub) => sub.id === 1);
    expect(subscription.verified).toBe(true);
    expect(subscription.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(mockDB.data.subscription_verifications).toHaveLength(1);
    expect(mockDB.data.subscription_verifications[0].subscription_id).toBe(1);
  });

  it("should reject request without token", async () => {
    const request = new Request("http://localhost/api/subscriptions/verify");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("Missing verification token");
  });

  it("should reject invalid token", async () => {
    const request = new Request("http://localhost/api/subscriptions/verify?token=invalid-token");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain("Invalid verification token");
  });

  it("should handle already verified subscription gracefully", async () => {
    // Pre-populate with verified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: true,
      verification_token: await hashStoredToken("valid-token-12345"),
      unsubscribe_token: "unsub-token-67890",
      created_at: new Date().toISOString(),
      confirmed_at: "2026-01-01 00:00:00",
    });

    const request = new Request("http://localhost/api/subscriptions/verify?token=valid-token-12345");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Email already verified");
    expect(mockDB.data.email_subscriptions[0].confirmed_at).toBe("2026-01-01 00:00:00");
  });

  it("should log verification to subscription_verifications table", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: false,
      verification_token: await hashStoredToken("valid-token-12345"),
      unsubscribe_token: "unsub-token-67890",
      created_at: new Date().toISOString(),
    });

    const request = new Request("http://localhost/api/subscriptions/verify?token=valid-token-12345");
    mockContext.request = request;

    await onRequestPost(mockContext);

    expect(mockDB.data.subscription_verifications).toHaveLength(1);
    expect(mockDB.data.subscription_verifications[0]).toMatchObject({
      subscription_id: 1,
      verified_at: expect.any(String),
    });
  });

  it("should redirect to success page after verification", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: false,
      verification_token: await hashStoredToken("valid-token-12345"),
      unsubscribe_token: "unsub-token-67890",
      created_at: new Date().toISOString(),
    });

    const request = new Request("http://localhost/api/subscriptions/verify?token=valid-token-12345");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toBe("https://example.com/subscribe?verified=true");
  });

  it("rejects an expired pending subscription but verifies one within the window", async () => {
    mockDB.data.email_subscriptions.push(
      {
        id: 1,
        email: "old@example.com",
        city: "all",
        genre: "all",
        frequency: "weekly",
        verified: false,
        verification_token: await hashStoredToken("old-token"),
        unsubscribe_token: "old-unsub",
        created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        email: "new@example.com",
        city: "all",
        genre: "all",
        frequency: "weekly",
        verified: false,
        verification_token: await hashStoredToken("new-token"),
        unsubscribe_token: "new-unsub",
        created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
    );

    for (const token of ["old-token", "new-token"]) {
      mockContext.request = new Request(`http://localhost/api/subscriptions/verify?token=${token}`, {
        method: "POST",
        body: new URLSearchParams({ token }),
      });
      await onRequestPost(mockContext);
    }

    expect(mockDB.data.email_subscriptions.map(({ verified }) => verified)).toEqual([false, true]);
  });

  it("keeps the update expiry guard when a stale lookup slips through", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "race@example.com",
      city: "all",
      genre: "all",
      frequency: "weekly",
      verified: false,
      verification_token: await hashStoredToken("race-token"),
      unsubscribe_token: "race-unsub",
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const prepare = mockDB.prepare.bind(mockDB);
    mockDB.prepare = (query) =>
      prepare(
        query.includes("SELECT id, email")
          ? query.replace("AND (verified = 1 OR (verified = 0 AND created_at >= datetime('now', '-7 days')))", "")
          : query,
      );

    mockContext.request = new Request("http://localhost/api/subscriptions/verify?token=race-token", {
      method: "POST",
      body: new URLSearchParams({ token: "race-token" }),
    });
    await onRequestPost(mockContext);

    expect(mockDB.data.email_subscriptions[0].verified).toBe(false);
  });

  it("does not accept a stored digest or retired token as submitted plaintext", async () => {
    const digest = await hashStoredToken("raw-token");
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "digest@example.com",
      city: "all",
      genre: "all",
      frequency: "weekly",
      verified: false,
      verification_token: digest,
      unsubscribe_token: "unsub",
      created_at: new Date().toISOString(),
    });

    for (const submitted of [digest, "retired:1"]) {
      const response = await onRequestPost({
        ...mockContext,
        request: new Request(`http://localhost/api/subscriptions/verify?token=${encodeURIComponent(submitted)}`, {
          method: "POST",
          body: new URLSearchParams({ token: submitted }),
        }),
      });
      expect(response.status).toBe(404);
    }
  });
});
