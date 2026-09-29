import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestPost } from "../subscribe.js";
import { MockD1Database } from "./mocks/d1.js";
import { createMockRequest, createMockContext, VALID_SUBSCRIPTION, INVALID_PAYLOADS } from "./helpers.js";

describe("POST /api/subscriptions/subscribe", () => {
  let mockDB;
  let mockContext;

  beforeEach(() => {
    // Reset mocks before each test
    mockDB = new MockD1Database();
    mockContext = createMockContext(mockDB);

    // Mock console.log and info to suppress logs
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should create new subscription successfully", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.message).toContain("Subscription created");
    // When email is not configured the response includes a verificationUrl
    // so developers/local environments can complete verification without email
    expect(data.verificationUrl).toMatch(/^https:\/\/example\.com\/api\/subscriptions\/verify\?token=/);

    expect(mockDB.data.email_subscriptions).toHaveLength(1);
    expect(mockDB.data.email_subscriptions[0]).toMatchObject({
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: false,
      consent_method: "web_form",
    });
    // CF-Connecting-IP is not present in test requests, so consent_ip is null
    expect(mockDB.data.email_subscriptions[0].consent_ip).toBeNull();
  });

  it("should reject request with missing email", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", INVALID_PAYLOADS.missingEmail);
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid email address");
    expect(mockDB.data.email_subscriptions).toHaveLength(0);
  });

  it("should reject request with invalid email format", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", INVALID_PAYLOADS.invalidEmail);
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid email address");
  });

  it("should default omitted preferences for an email-only request", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", { email: "email-only@example.com" });
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(201);
    expect(mockDB.data.email_subscriptions[0]).toMatchObject({
      email: "email-only@example.com",
      city: "all",
      genre: "all",
      frequency: "weekly",
    });
  });

  it("should default empty preferences for an email-only request", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", {
      email: "empty-preferences@example.com",
      city: " ",
      genre: "",
      frequency: "",
    });
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(201);
    expect(mockDB.data.email_subscriptions[0]).toMatchObject({ city: "all", genre: "all", frequency: "weekly" });
  });

  it("should reject an invalid frequency when one is provided", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", {
      email: "invalid-frequency@example.com",
      frequency: "yearly",
    });
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid frequency value");
    expect(mockDB.data.email_subscriptions).toHaveLength(0);
  });

  it("should send verification email copy without preference fields", async () => {
    mockContext.env.EMAIL_PROVIDER = "mailchannels";
    mockContext.env.EMAIL_FROM = "no-reply@example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    mockContext.request = createMockRequest("POST", "/api/subscriptions/subscribe", {
      email: "copy@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
    });

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(201);
    const [, options] = fetch.mock.calls[0];
    const payload = JSON.parse(options.body);
    const text = payload.content.find(({ type }) => type === "text/plain").value;
    const html = payload.content.find(({ type }) => type === "text/html").value;
    expect(text).toContain("Please confirm your subscription to SetTimes show announcements.");
    expect(html).toContain("Please confirm your subscription to SetTimes show announcements.");
    expect(text).not.toContain("City:");
    expect(text).not.toContain("Genre:");
    expect(html).not.toContain("City:");
    expect(html).not.toContain("Genre:");
  });

  it("should reject duplicate verified subscription", async () => {
    // Pre-populate with verified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: true,
      verification_token: "existing-token-12345",
      unsubscribe_token: "existing-unsub-token-67890",
      created_at: new Date().toISOString(),
    });

    const request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("already subscribed");
    expect(mockDB.data.email_subscriptions).toHaveLength(1);
  });

  it("should resend verification email for unverified subscription", async () => {
    // Pre-populate with unverified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
      verified: false,
      verification_token: "existing-token-12345",
      unsubscribe_token: "existing-unsub-token-67890",
      created_at: new Date().toISOString(),
    });

    const request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(200);
    const data = await response.json();
    // When email is not configured, the response is explicit about it and
    // includes the verificationUrl instead of falsely claiming email was sent
    expect(data.message).toContain("not configured");
    expect(data.verificationUrl).toMatch(
      /^https:\/\/example\.com\/api\/subscriptions\/verify\?token=existing-token-12345$/,
    );
    expect(mockDB.data.email_subscriptions).toHaveLength(1);
  });

  it("should generate unique verification and unsubscribe tokens", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    mockContext.request = request;

    await onRequestPost(mockContext);

    const subscription = mockDB.data.email_subscriptions[0];
    expect(subscription.verification_token).toMatch(/^[0-9a-f]{64}$/);
    expect(subscription.unsubscribe_token).toMatch(/^[0-9a-f]{64}$/);
    expect(subscription.verification_token).not.toBe(subscription.unsubscribe_token);
  });

  it("should handle database errors gracefully", async () => {
    // Mock database to throw error
    mockDB.prepare = () => ({
      bind: () => ({
        run: async () => {
          throw new Error("Database connection failed");
        },
        all: async () => {
          throw new Error("Database connection failed");
        },
      }),
    });

    const request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    mockContext.request = request;

    const response = await onRequestPost(mockContext);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Subscription failed");
  });

  it("should allow same email for different city/genre combinations", async () => {
    // First subscription
    const request1 = createMockRequest("POST", "/api/subscriptions/subscribe", {
      email: "test@example.com",
      city: "portland",
      genre: "punk",
      frequency: "weekly",
    });
    mockContext.request = request1;

    const response1 = await onRequestPost(mockContext);

    // Second subscription (different city)
    const request2 = createMockRequest("POST", "/api/subscriptions/subscribe", {
      email: "test@example.com",
      city: "seattle",
      genre: "punk",
      frequency: "weekly",
    });
    mockContext.request = request2;

    const response2 = await onRequestPost(mockContext);

    expect(response1.status).toBe(201);
    expect(response2.status).toBe(201);
    expect(mockDB.data.email_subscriptions).toHaveLength(2);
    expect(mockDB.data.email_subscriptions[0].city).toBe("portland");
    expect(mockDB.data.email_subscriptions[1].city).toBe("seattle");
  });

  it("should accept all valid frequency values", async () => {
    const frequencies = ["daily", "weekly", "monthly"];

    for (const frequency of frequencies) {
      const request = createMockRequest("POST", "/api/subscriptions/subscribe", {
        email: `test-${frequency}@example.com`,
        city: "portland",
        genre: "punk",
        frequency,
      });
      mockContext.request = request;

      const response = await onRequestPost(mockContext);
      expect(response.status).toBe(201);
    }

    expect(mockDB.data.email_subscriptions).toHaveLength(3);
    expect(mockDB.data.email_subscriptions[0].frequency).toBe("daily");
    expect(mockDB.data.email_subscriptions[1].frequency).toBe("weekly");
    expect(mockDB.data.email_subscriptions[2].frequency).toBe("monthly");
  });

  it("does not log verification links or subscriber emails when email is not configured", async () => {
    const request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    mockContext.request = request;

    await onRequestPost(mockContext);

    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[Subscribe] Email not configured; verification email was not sent.");
  });
});
