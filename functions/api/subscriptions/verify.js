// GET /api/subscriptions/verify?token=xxx renders the verification page.
// POST verifies the subscription.

import { getPublicBaseUrl } from "../../utils/publicUrl.js";
import { emailActionPage, readEmailActionToken } from "../../utils/emailActionPage.js";
import { pendingConfirmationLiveSql } from "../../utils/consent.js";

export async function onRequestGet(context) {
  const { request } = context;
  const token = await readEmailActionToken(request);
  if (!token) return new Response("Missing verification token", { status: 400 });
  return emailActionPage({
    action: new URL(request.url).pathname,
    token,
    heading: "Confirm your subscription",
    message: "Click the button below to confirm your SetTimes subscription.",
    buttonLabel: "Confirm my subscription",
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = await readEmailActionToken(request);

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
        AND (verified = 1 OR (verified = 0 AND ${pendingConfirmationLiveSql()}))
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
      SET verified = 1, confirmed_at = datetime('now')
      WHERE verification_token = ?
        AND verified = 0
        AND ${pendingConfirmationLiveSql()}
    `,
    )
      .bind(token)
      .run();

    if (!verifyResult?.meta?.changes) {
      // Either a concurrent click verified it, or the link expired between the
      // lookup and this write. Only the first is "already verified".
      const current = await env.DB.prepare("SELECT verified FROM email_subscriptions WHERE verification_token = ?")
        .bind(token)
        .first();
      if (!current?.verified) {
        return new Response("This verification link has expired. Please subscribe again.", { status: 410 });
      }
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
    const baseUrl = getPublicBaseUrl(env);
    return Response.redirect(`${baseUrl}/subscribe?verified=true`, 303);
  } catch (error) {
    console.error("Verification error:", error);
    return new Response("Verification failed", { status: 500 });
  }
}
