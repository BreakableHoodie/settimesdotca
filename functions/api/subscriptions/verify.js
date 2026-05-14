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

    // Mark as verified atomically to prevent token replay races
    const verifyResult = await env.DB.prepare(
      `
      UPDATE email_subscriptions
      SET verified = 1
      WHERE verification_token = ?
        AND verified = 0
    `,
    )
      .bind(token)
      .run();

    if (!verifyResult?.meta?.changes) {
      return new Response("Email already verified", { status: 200 });
    }

    // Log verification (best effort; don't fail successful verifications)
    try {
      await env.DB.prepare(
        `
        INSERT INTO subscription_verifications (subscription_id)
        VALUES (?)
      `,
      )
        .bind(subscription.id)
        .run();
    } catch (auditError) {
      console.error("Verification audit log failed:", auditError);
    }

    // Redirect to success page
    const baseUrl = env.PUBLIC_URL || new URL(request.url).origin;
    return Response.redirect(`${baseUrl}/subscribe?verified=true`, 302);
  } catch (error) {
    console.error("Verification error:", error);
    return new Response("Verification failed", { status: 500 });
  }
}
