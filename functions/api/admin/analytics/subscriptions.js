// Subscription analytics (privacy-preserving)
// No PII exposed, aggregate metrics only

import { checkPermission, auditLog } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require admin role (viewer+ would also be acceptable for read-only analytics)
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {

    // Total subscriptions
    const { results: total } = await DB.prepare(
      `
      SELECT COUNT(*) as count FROM email_subscriptions WHERE verified = 1
    `,
    ).all();

    // By city
    const { results: byCity } = await DB.prepare(
      `
      SELECT city, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY city
      ORDER BY count DESC
    `,
    ).all();

    // By genre
    const { results: byGenre } = await DB.prepare(
      `
      SELECT genre, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY genre
      ORDER BY count DESC
    `,
    ).all();

    // By frequency
    const { results: byFrequency } = await DB.prepare(
      `
      SELECT frequency, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY frequency
    `,
    ).all();

    // Growth over time (last 30 days)
    const { results: growth } = await DB.prepare(
      `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      AND created_at >= date('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    ).all();

    // Unsubscribe rate
    const { results: unsubscribes } = await DB.prepare(
      `
      SELECT COUNT(*) as count FROM subscription_unsubscribes
    `,
    ).all();

    // Audit log analytics access
    await auditLog(
      env,
      user.userId,
      "analytics.subscriptions.viewed",
      "analytics",
      null,
      {
        totalSubscribers: total[0].count,
        totalUnsubscribes: unsubscribes[0].count,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        total_subscribers: total[0].count,
        by_city: byCity,
        by_genre: byGenre,
        by_frequency: byFrequency,
        growth_30_days: growth,
        total_unsubscribes: unsubscribes[0].count,
        unsubscribe_rate:
          total[0].count > 0
            ? ((unsubscribes[0].count / total[0].count) * 100).toFixed(2) + "%"
            : "0%",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Analytics error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch analytics" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
