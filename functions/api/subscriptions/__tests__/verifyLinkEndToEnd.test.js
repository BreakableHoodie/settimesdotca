import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestPost as subscribe } from "../subscribe.js";
import { onRequestGet as verify } from "../verify.js";
import { MockD1Database } from "./mocks/d1.js";
import { createMockContext, createMockRequest, VALID_SUBSCRIPTION } from "./helpers.js";

// From #21 until 2026-09-29 the confirmation email linked to `/verify`, a path
// nothing serves, so every link 404'd and no subscriber could ever verify.
// Both halves were tested -- but separately: subscribe.test asserted the (wrong)
// URL shape and verify.test called /api/subscriptions/verify directly. Nothing
// ever FOLLOWED the emailed link. This does: the URL subscribe produces is the
// one fed to the verify handler, so a link and a handler that drift apart fail.
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
