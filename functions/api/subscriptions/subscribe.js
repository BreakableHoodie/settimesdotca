// Subscription endpoint
// POST /api/subscriptions/subscribe

import { generateToken } from "../../utils/tokens.js";
import { sendEmail, isEmailConfigured } from "../../utils/email.js";
import { isValidEmail } from "../../utils/validation.js";
import { verifyTurnstile } from "../../utils/turnstile.js";
import { escapeHtml } from "../../utils/html.js";
import { getPublicBaseUrl } from "../../utils/publicUrl.js";
import { parseJsonObjectBody } from "../../utils/request.js";
import { CONSENT_VERSION, pendingConfirmationLiveSql } from "../../utils/consent.js";
import { isDevRequest } from "../../utils/auth.js";
import { allowEmailToRecipient, recipientLogId } from "../../utils/recipientEmailCap.js";

const FREQUENCY_OPTIONS = new Set(["daily", "weekly", "monthly"]);
const MAX_EMAIL_LENGTH = 320;
const MAX_CITY_LENGTH = 100;
const MAX_GENRE_LENGTH = 100;
const MAX_FREQUENCY_LENGTH = 20;

// Build a JSON Response, merging an optional verificationUrl when email
// delivery was skipped so local/dev environments can verify without email.
function subscriptionResponse(body, status, emailResult, request, env) {
  const payload =
    !emailResult.delivered && emailResult.reason === "not_configured" && isDevRequest(request, env)
      ? { ...body, verificationUrl: emailResult.verifyUrl }
      : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const city = typeof body.city === "string" && body.city.trim() ? body.city.trim() : "all";
    const genre = typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : "all";
    const frequency =
      typeof body.frequency === "string" && body.frequency.trim() ? body.frequency.trim().toLowerCase() : "weekly";
    const turnstileToken = body.turnstileToken;

    // Validation
    if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (city.length > MAX_CITY_LENGTH || genre.length > MAX_GENRE_LENGTH || frequency.length > MAX_FREQUENCY_LENGTH) {
      return new Response(JSON.stringify({ error: "One or more fields exceed maximum length" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!FREQUENCY_OPTIONS.has(frequency)) {
      return new Response(JSON.stringify({ error: "Invalid frequency value" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const turnstileValid = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstileValid) {
      return new Response(JSON.stringify({ error: "Bot verification failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
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
        const expired = await env.DB.prepare(
          `DELETE FROM email_subscriptions
           WHERE id = ? AND verified = 0 AND NOT (${pendingConfirmationLiveSql()})`,
        )
          .bind(existing[0].id)
          .run();

        // Nothing deleted means the row was still live -- or a concurrent
        // request already replaced it. Re-read, so a re-send always carries the
        // token that is stored NOW rather than one read before that request
        // rotated it (which would email a link that can never work).
        const current =
          expired.meta.changes === 0
            ? (
                await env.DB.prepare(
                  `SELECT id, verified, verification_token FROM email_subscriptions
                   WHERE email = ? AND city = ? AND genre = ?`,
                )
                  .bind(email, city, genre)
                  .all()
              ).results[0]
            : null;

        if (current?.verified) {
          return new Response(JSON.stringify({ error: "You are already subscribed to this feed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (current) {
          // Re-send verification email
          const emailResult = await sendVerificationEmail(env, email, current.verification_token);

          if (!emailResult.delivered && emailResult.reason === "not_configured") {
            return subscriptionResponse(
              {
                message: "Email delivery is not configured. Use the link below to verify your subscription.",
              },
              200,
              emailResult,
              request,
              env,
            );
          }

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
    }

    // Create subscription
    const consentIp = request.headers.get("CF-Connecting-IP") ?? null;
    try {
      await env.DB.prepare(
        `
        INSERT INTO email_subscriptions (email, city, genre, frequency, verification_token, unsubscribe_token, consent_ip, consent_method, consent_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'web_form', ?)
      `,
      )
        .bind(email, city, genre, frequency, verificationToken, unsubscribeToken, consentIp, CONSENT_VERSION)
        .run();
    } catch (insertError) {
      if (insertError?.message?.includes("UNIQUE constraint failed")) {
        return new Response(JSON.stringify({ error: "You are already subscribed to this feed" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    // Send verification email
    const emailResult = await sendVerificationEmail(env, email, verificationToken);

    // Capped (#1337): the token was never mailed, so drop the row we just created;
    // otherwise a later request would only ever re-send, and that too would be capped.
    if (emailResult.capped) {
      try {
        await env.DB.prepare("DELETE FROM email_subscriptions WHERE verification_token = ? AND verified = 0")
          .bind(verificationToken)
          .run();
      } catch (err) {
        console.error("[Subscribe] Failed to drop capped pending subscription:", err);
      }
    }

    if (!emailResult.delivered && emailResult.reason === "not_configured") {
      return subscriptionResponse(
        {
          message:
            "Subscription created. Email delivery is not configured; use the link below to verify your subscription.",
        },
        201,
        emailResult,
        request,
        env,
      );
    }

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

async function sendVerificationEmail(env, email, token) {
  const baseUrl = getPublicBaseUrl(env);
  // Must target the handler, functions/api/subscriptions/verify.js: a path
  // nothing serves 404s every confirmation. emailLinkTargets.test.js checks
  // that every emailed link resolves.
  const verifyUrl = `${baseUrl}/api/subscriptions/verify?token=${encodeURIComponent(token)}`;
  const subject = "Confirm your SetTimes subscription";
  const text = `Please confirm your subscription to SetTimes show announcements.\n\nVerify: ${verifyUrl}`;
  const html = `
    <p>Please confirm your subscription to SetTimes show announcements.</p>
    <p><a href="${escapeHtml(verifyUrl)}">Verify your email</a></p>
  `.trim();

  if (isEmailConfigured(env)) {
    // Per-recipient cap (#1337). Over it: no email, and a result that matches no caller's
    // "not_configured" branch, so the response is the ordinary success one.
    if (!(await allowEmailToRecipient(env.DB, email))) {
      console.warn("[Subscribe] Recipient email cap reached; verification not sent:", await recipientLogId(email));
      return { delivered: false, reason: "recipient_capped", capped: true, verifyUrl };
    }
    const emailResult = await sendEmail(env, {
      to: email,
      subject,
      text,
      html,
    });
    return { ...emailResult, verifyUrl };
  } else {
    console.warn("[Subscribe] Email not configured; verification email was not sent.");
    return { delivered: false, reason: "not_configured", verifyUrl };
  }
}
