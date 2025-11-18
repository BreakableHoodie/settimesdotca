// Subscription endpoint
// POST /api/subscriptions/subscribe

import { generateToken } from "../../utils/tokens";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email, city, genre, frequency } = await request.json();

    // Validation
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!city || !genre || !frequency) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Generate tokens
    const verificationToken = generateToken();
    const unsubscribeToken = generateToken();

    // Check if subscription already exists
    const { results: existing } = await env.DB.prepare(
      `
      SELECT id, verified, verification_token FROM email_subscriptions
      WHERE email = ? AND city = ? AND genre = ?
    `,
    )
      .bind(email, city, genre)
      .all();

    if (existing.length > 0) {
      if (existing[0].verified) {
        return new Response(
          JSON.stringify({
            error: "You are already subscribed to this feed",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      } else {
        // Re-send verification email
        await sendVerificationEmail(
          env,
          email,
          city,
          genre,
          existing[0].verification_token,
        );

        return new Response(
          JSON.stringify({
            message: "Verification email sent. Please check your inbox.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Create subscription
    const result = await env.DB.prepare(
      `
      INSERT INTO email_subscriptions (email, city, genre, frequency, verification_token, unsubscribe_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(email, city, genre, frequency, verificationToken, unsubscribeToken)
      .run();

    // Send verification email
    await sendVerificationEmail(env, email, city, genre, verificationToken);

    return new Response(
      JSON.stringify({
        message: "Subscription created. Please check your email to verify.",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Subscription error:", error);
    return new Response(JSON.stringify({ error: "Subscription failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function sendVerificationEmail(env, email, city, genre, token) {
  const verifyUrl = `${env.PUBLIC_URL}/verify?token=${token}`;

  // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
  // For now, just log (development only)
  console.info(`Verification email for ${email}: ${verifyUrl}`);

  // In production, send actual email:
  // await env.EMAIL_SERVICE.send({
  //   to: email,
  //   subject: `Verify your subscription to ${city} ${genre} shows`,
  //   html: `
  //     <p>Thanks for subscribing!</p>
  //     <p>Click to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>
  //   `
  // })
}
