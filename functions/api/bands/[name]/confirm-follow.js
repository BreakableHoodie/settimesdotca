// GET /api/bands/:name/confirm-follow?token=... renders the confirmation page.
// POST confirms the pending double opt-in band follow.

import { escapeHtml } from "../../../utils/html.js";
import { emailActionPage, emailResultPage, readEmailActionToken } from "../../../utils/emailActionPage.js";
import { pendingConfirmationLiveSql } from "../../../utils/consent.js";

export async function onRequestGet(context) {
  const { request } = context;
  const token = await readEmailActionToken(request);
  if (!token) {
    return new Response("Invalid token.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return emailActionPage({
    action: new URL(request.url).pathname,
    token,
    heading: "Confirm your follow",
    message: "Click the button below to confirm your follow.",
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

    // Resolve the pending follow by its one-time verification token.
    const row = await DB.prepare(
      `SELECT bf.id, bp.name AS band_name
       FROM band_follows bf
       JOIN band_profiles bp ON bp.id = bf.band_profile_id
       WHERE bf.verification_token = ?
         AND (bf.verified = 1 OR (bf.verified = 0 AND ${pendingConfirmationLiveSql("bf")}))`,
    )
      .bind(token)
      .first();

    if (!row) {
      // Token invalid, already used, or expired — keep it generic.
      return emailResultPage(
        `Link expired`,
        `This confirmation link is invalid or has already been used. If you already confirmed, you're all set.`,
      );
    }

    // Verify and clear the one-time token in one statement. This is idempotent:
    // a second click finds no matching token (already NULL) and changes nothing.
    const update = await DB.prepare(
      `UPDATE band_follows
       SET verified = 1, confirmed_at = datetime('now'), verification_token = NULL
       WHERE id = ? AND verified = 0 AND ${pendingConfirmationLiveSql()}`,
    )
      .bind(row.id)
      .run();

    // No change means either a concurrent click already confirmed it (true
    // success) or the link reached the end of its window between the lookup
    // and this write. Re-read rather than claim a follow that was not recorded.
    if (!update?.meta?.changes) {
      const current = await DB.prepare("SELECT verified FROM band_follows WHERE id = ?").bind(row.id).first();
      if (!current?.verified) {
        return emailResultPage(
          `Link expired`,
          `This confirmation link is invalid or has already been used. If you already confirmed, you're all set.`,
        );
      }
    }

    return emailResultPage(
      `You&apos;re following ${escapeHtml(row.band_name)}`,
      `We'll email you when they join a lineup. You can unsubscribe anytime from those emails.`,
    );
  } catch (err) {
    console.error("[band-confirm-follow] Error:", err);
    return new Response("An error occurred.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
