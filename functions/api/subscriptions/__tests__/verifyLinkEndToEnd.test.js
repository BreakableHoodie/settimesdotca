import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestPost as subscribe } from "../subscribe.js";
import { onRequestGet as verify } from "../verify.js";
import { MockD1Database } from "./mocks/d1.js";
import { createMockContext, createMockRequest, VALID_SUBSCRIPTION } from "./helpers.js";

// Testing the link's shape and the handler separately lets the two drift apart
// unnoticed. This feeds the URL subscribe produces into the verify handler.
// The handler reads only the query string, so the pathname assertion is what
// catches a link aimed at the wrong route.
describe("the emailed verification link reaches the verify handler", () => {
  let mockDB;
  let context;

  beforeEach(() => {
    mockDB = new MockD1Database();
    context = createMockContext(mockDB);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("points at the verify function's route", async () => {
    context.request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    const { verificationUrl } = await (await subscribe(context)).json();

    // functions/api/subscriptions/verify.js is served at exactly this path.
    expect(new URL(verificationUrl).pathname).toBe("/api/subscriptions/verify");
  });

  it("verifies the subscription when the link is followed", async () => {
    context.request = createMockRequest("POST", "/api/subscriptions/subscribe", VALID_SUBSCRIPTION);
    const { verificationUrl } = await (await subscribe(context)).json();
    expect(mockDB.data.email_subscriptions[0].verified).toBe(false);

    context.request = new Request(verificationUrl);
    const response = await verify(context);

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("Location")).pathname).toBe("/subscribe");
    expect(new URL(response.headers.get("Location")).searchParams.get("verified")).toBe("true");
    expect(mockDB.data.email_subscriptions[0].verified).toBe(true);
  });
});
