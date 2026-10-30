import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestGet, onRequestPost } from "../unsubscribe.js";
import { MockD1Database } from "./mocks/d1.js";
import { createMockContext } from "./helpers.js";
import { hashStoredToken } from "../../../utils/tokens.js";
import { unsubscribeToken, UNSUBSCRIBE_KINDS } from "../../../utils/unsubscribeLinks.js";

describe("/api/subscriptions/unsubscribe", () => {
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

  it("GET renders a form without unsubscribing, then POST unsubscribes", async () => {
    // Pre-populate with subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: true,
      verification_token: await hashStoredToken("verify-token-12345"),
      unsubscribe_token: await hashStoredToken("valid-token-67890"),
      created_at: new Date().toISOString(),
    });

    const request = new Request("http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890");
    mockContext.request = request;

    const getResponse = await onRequestGet(mockContext);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toContain('method="post"');
    expect(mockDB.data.email_subscriptions).toHaveLength(1);

    mockContext.request = new Request("http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "valid-token-67890" }),
    });
    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(200);
    expect(mockDB.data.email_subscriptions).toHaveLength(0);
    expect(mockDB.data.subscription_unsubscribes).toHaveLength(1);
    expect(mockDB.data.subscription_unsubscribes[0].subscription_id).toBe(1);
  });

  it("POST supports RFC 8058 query-string token fallback", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: true,
      verification_token: await hashStoredToken("verify-token-12345"),
      unsubscribe_token: await hashStoredToken("one-click-token"),
      created_at: new Date().toISOString(),
    });

    mockContext.request = new Request("http://localhost/api/subscriptions/unsubscribe?token=one-click-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(200);
    expect(mockDB.data.email_subscriptions).toHaveLength(0);
  });

  it("should reject request without token", async () => {
    const request = new Request("http://localhost/api/subscriptions/unsubscribe");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("Missing unsubscribe token");
  });

  it("should reject invalid token", async () => {
    const request = new Request("http://localhost/api/subscriptions/unsubscribe?token=invalid-token");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain("Invalid unsubscribe token");
  });

  it("should log unsubscribe to subscription_unsubscribes table", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: true,
      verification_token: await hashStoredToken("verify-token-12345"),
      unsubscribe_token: await hashStoredToken("valid-token-67890"),
      created_at: new Date().toISOString(),
    });

    const request = new Request("http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890");
    mockContext.request = request;

    await onRequestPost(mockContext);

    expect(mockDB.data.subscription_unsubscribes).toHaveLength(1);
    expect(mockDB.data.subscription_unsubscribes[0]).toMatchObject({
      subscription_id: 1,
      unsubscribed_at: expect.any(String),
    });
  });

  it("should return HTML success page", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: true,
      verification_token: await hashStoredToken("verify-token-12345"),
      unsubscribe_token: await hashStoredToken("valid-token-67890"),
      created_at: new Date().toISOString(),
    });

    const request = new Request("http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890");
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

    const html = await response.text();
    expect(html).toContain("Unsubscribed");
    expect(html).toContain("unsubscribed from SetTimes show announcements");
    expect(html).not.toContain("all all");
    expect(html).toContain("example.com/subscribe");
  });
  it("unsubscribes only the row named by a derived token", async () => {
    mockDB.data.email_subscriptions.push(
      { id: 1, email: "one@example.com", city: "all", genre: "all", unsubscribe_token: "sha256:one" },
      { id: 2, email: "two@example.com", city: "all", genre: "all", unsubscribe_token: "sha256:two" },
    );
    const token = await unsubscribeToken(mockContext.env, UNSUBSCRIBE_KINDS.subscription, 1);
    mockContext.request = new Request(`http://localhost/api/subscriptions/unsubscribe?token=${token}`, {
      method: "POST",
    });

    expect((await onRequestPost(mockContext)).status).toBe(200);
    expect(mockDB.data.email_subscriptions.map((sub) => sub.id)).toEqual([2]);
  });

  it("does not redeem a stored digest or a token for another kind", async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "one@example.com",
      city: "all",
      genre: "all",
      unsubscribe_token: "sha256:stored",
    });
    const otherKind = await unsubscribeToken(mockContext.env, UNSUBSCRIBE_KINDS.bandFollow, 1);
    for (const token of ["sha256:stored", otherKind]) {
      mockContext.request = new Request(
        `http://localhost/api/subscriptions/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      expect((await onRequestPost(mockContext)).status).toBe(404);
    }
    expect(mockDB.data.email_subscriptions).toHaveLength(1);
  });
});
