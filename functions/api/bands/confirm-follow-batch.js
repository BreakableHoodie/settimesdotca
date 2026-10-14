// GET /api/bands/confirm-follow-batch?token=<batch_token> renders the page.
// POST confirms all pending (verified=0) band follows that share the token.
//
// The batch_token is shared across every band_follows row created by a single
// POST /api/bands/follow-batch request. One click here verifies all of them.
//
// Idempotent: the UPDATE clears batch_token to NULL on first click, so a second
// click finds no matching rows and changes nothing — the fan still sees a success
// page without any error. Messaging is generic to avoid revealing whether a given
// token was valid (no enumeration).

import { emailActionPage, emailResultPage, readEmailActionToken } from "../../utils/emailActionPage.js";
import { pendingConfirmationLiveSql } from "../../utils/consent.js";

export async function onRequestGet(context) {
  const { request } = context;
  const token = await readEmailActionToken(request);
  if (!token) {
    return new Response("Invalid token.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  return emailActionPage({
    action: new URL(request.url).pathname,
    token,
    heading: "Confirm your lineup",
    message: "Click the button below to confirm your follows.",
    buttonLabel: "Confirm my follow",
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const token = await readEmailActionToken(request);

    if (!token) {
      return new Response("Invalid token.", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Verify all pending follows in this batch and clear the shared token in one
    // statement. A second click finds batch_token already NULL, so no rows match.
    // changes=0 gets the same generic page as an unknown token: now that this
    // runs on a deliberate button press, "You're all set" for a token that
    // confirmed nothing would be a false success.
    const result = await DB.prepare(
      `UPDATE band_follows
       SET verified = 1, confirmed_at = datetime('now'), verification_token = NULL, batch_token = NULL
       WHERE batch_token = ? AND verified = 0 AND ${pendingConfirmationLiveSql()}`,
    )
      .bind(token)
      .run();

    if (!result?.meta?.changes) {
      return emailResultPage(
        "Link expired",
        "This confirmation link is invalid or has already been used. If you already confirmed, you&apos;re all set.",
      );
    }

    return emailResultPage(
      `You&apos;re all set!`,
      `We'll email you when your bands join a lineup. You can unsubscribe anytime from those emails.`,
    );
  } catch (err) {
    console.error("[band-confirm-follow-batch] Error:", err);
    return new Response("An error occurred.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
