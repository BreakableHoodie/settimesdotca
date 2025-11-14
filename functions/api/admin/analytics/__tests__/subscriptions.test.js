import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as subscriptionsHandler from "../subscriptions.js";

describe("Admin analytics subscriptions API", () => {
  test("admin can retrieve subscription analytics aggregates", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });

    // Insert test subscription data
    rawDb.prepare(
      "INSERT INTO email_subscriptions (email, city, genre, unsubscribe_token, verified) VALUES (?, ?, ?, ?, ?)"
    ).run("user1@test.com", "Portland", "punk", "token1", 1);

    rawDb.prepare(
      "INSERT INTO email_subscriptions (email, city, genre, unsubscribe_token, verified) VALUES (?, ?, ?, ?, ?)"
    ).run("user2@test.com", "Seattle", "indie", "token2", 1);

    // Get the second subscription ID to unsubscribe
    const sub2 = rawDb.prepare("SELECT id FROM email_subscriptions WHERE email = ?").get("user2@test.com");

    // Add an unsubscribe record
    rawDb.prepare(
      "INSERT INTO subscription_unsubscribes (subscription_id, reason) VALUES (?, ?)"
    ).run(sub2.id, "Test unsubscribe");

    const request = new Request(
      "https://example.test/api/admin/analytics/subscriptions",
      {
        headers,
      }
    );

    const response = await subscriptionsHandler.onRequestGet({ request, env });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.total_subscribers).toBe(2);
    expect(payload.total_unsubscribes).toBe(1);
    expect(payload.unsubscribe_rate).toBe("50.00%");
    expect(Array.isArray(payload.by_city)).toBe(true);
    const cities = payload.by_city.reduce((acc, row) => {
      acc[row.city] = row.count;
      return acc;
    }, {});
    expect(cities).toMatchObject({ Portland: 1, Seattle: 1 });
  });

  test("non-admin requests are forbidden", async () => {
    const { env, headers } = createTestEnv({ role: "viewer" });
    const request = new Request(
      "https://example.test/api/admin/analytics/subscriptions",
      {
        headers,
      }
    );

    const response = await subscriptionsHandler.onRequestGet({ request, env });
    expect(response.status).toBe(403);
  });
});
