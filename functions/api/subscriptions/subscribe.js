// Subscription endpoint
// POST /api/subscriptions/subscribe

import { generateToken } from "../../utils/tokens";
import { sendEmail, isEmailConfigured } from "../../utils/email.js";

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
  const baseUrl = env.PUBLIC_URL || "http://localhost:5173";
  const verifyUrl = `${baseUrl}/verify?token=${token}`;
  const subject = "Confirm your SetTimes subscription";
  const text = `Please confirm your subscription.\n\nVerify: ${verifyUrl}\n\nCity: ${city}\nGenre: ${genre}`;
  const html = `
    <p>Please confirm your subscription.</p>
    <p><a href="${verifyUrl}">Verify your email</a></p>
    <p>City: ${city}<br/>Genre: ${genre}</p>
  `.trim();

  console.log("[Subscribe] Checking email configuration...");

  if (isEmailConfigured(env)) {
    console.log("[Subscribe] Sending verification email to:", email);
    const emailResult = await sendEmail(env, { to: email, subject, text, html });
    console.log("[Subscribe] Email result:", emailResult);
    return emailResult;
  } else {
    console.warn("[Subscribe] Email not configured, logging verification link");
    console.info(`[Email] Verification link for ${email}: ${verifyUrl}`);
    return { delivered: false, reason: "not_configured" };
  }
}
