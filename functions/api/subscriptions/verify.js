// Email verification endpoint
// GET /api/subscriptions/verify?token=xxx

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing verification token", { status: 400 });
  }

  try {
    // Find subscription
    const { results } = await env.DB.prepare(
      `
      SELECT id, email, city, genre, verified
      FROM email_subscriptions
      WHERE verification_token = ?
    `,
    )
      .bind(token)
      .all();

    if (results.length === 0) {
      return new Response("Invalid verification token", { status: 404 });
    }

    const subscription = results[0];

    if (subscription.verified) {
      return new Response("Email already verified", { status: 200 });
    }

    // Mark as verified
    await env.DB.prepare(
      `
      UPDATE email_subscriptions
      SET verified = 1
      WHERE id = ?
    `,
    )
      .bind(subscription.id)
      .run();

    // Log verification
    await env.DB.prepare(
      `
      INSERT INTO subscription_verifications (subscription_id)
      VALUES (?)
    `,
    )
      .bind(subscription.id)
      .run();

    // Redirect to success page
    return Response.redirect(`${env.PUBLIC_URL}/subscribe?verified=true`, 302);
  } catch (error) {
    console.error("Verification error:", error);
    return new Response("Verification failed", { status: 500 });
  }
}
