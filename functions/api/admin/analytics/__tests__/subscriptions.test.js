import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as subscriptionsHandler from "../subscriptions.js";

describe("Admin analytics subscriptions API", () => {
  test("admin can retrieve subscription analytics aggregates", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

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
