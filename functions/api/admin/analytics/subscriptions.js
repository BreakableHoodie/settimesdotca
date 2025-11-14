// Subscription analytics (privacy-preserving)
// No PII exposed, aggregate metrics only

export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    // Get admin session from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionToken = authHeader.substring(7);

    // Verify admin session
    const session = await DB.prepare(
      `
      SELECT u.id, u.email, u.role, u.name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `,
    )
      .bind(sessionToken)
      .first();

    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if admin has permission
    if (session.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

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
