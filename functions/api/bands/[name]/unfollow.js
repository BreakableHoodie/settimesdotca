// GET /api/bands/:name/unfollow?token=...
// Deletes the band follow associated with the unsubscribe token.
// Answers 200 whether or not the token matched. Links are keyed (#1415), so
// saying which reveals nothing an attacker could use.

import { escapeHtml } from "../../../utils/html.js";
import { emailActionPage, readEmailActionToken } from "../../../utils/emailActionPage.js";
import { hashStoredToken } from "../../../utils/tokens.js";
import {
  isDerivedUnsubscribeToken,
  UNSUBSCRIBE_KINDS,
  verifyUnsubscribeToken,
} from "../../../utils/unsubscribeLinks.js";

export async function onRequestGet(context) {
  const { request } = context;
  const token = await readEmailActionToken(request);
  if (!token) {
    return new Response("Invalid token.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  return emailActionPage({
    action: new URL(request.url).pathname,
    token,
    heading: "Unfollow this band",
    message: "Click the button below to stop receiving emails about this band.",
    buttonLabel: "Unfollow",
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

    // Resolve the band name BEFORE deleting so the page can name it. An unknown
    // token yields no row and a "nothing to unfollow" page (still 200). A link
    // that cannot be checked at all (no key) throws into the 500 below.
    let follow = null;
    if (isDerivedUnsubscribeToken(token)) {
      const id = await verifyUnsubscribeToken(env, UNSUBSCRIBE_KINDS.bandFollow, token);
      if (id !== null) {
        follow = await DB.prepare(
          `SELECT bf.id, bp.name AS band_name
           FROM band_follows bf
           JOIN band_profiles bp ON bp.id = bf.band_profile_id
           WHERE bf.id = ?`,
        )
          .bind(id)
          .first();
      }
    } else {
      const tokenHash = await hashStoredToken(token);
      follow = await DB.prepare(
        `SELECT bf.id, bp.name AS band_name
         FROM band_follows bf
         JOIN band_profiles bp ON bp.id = bf.band_profile_id
         WHERE bf.unsubscribe_token = ?`,
      )
        .bind(tokenHash)
        .first();
    }

    if (follow) {
      await DB.prepare("DELETE FROM band_follows WHERE id = ?").bind(follow.id).run();
    }

    // No row: the link is not valid, or this follow was already removed. Say
    // so honestly; never claim a removal that did not happen (#1415).
    const bandName = follow?.band_name ? escapeHtml(follow.band_name) : null;
    const heading = follow ? (bandName ? `Unfollowed ${bandName}` : "Unfollowed") : "Nothing to unfollow";
    const message = follow
      ? bandName
        ? `You've been removed from ${bandName}'s follower list — you won't get any more emails about them.`
        : `You have been removed from this band's follower list.`
      : "This link isn't valid, or you've already unfollowed this band.";

    return new Response(
      `<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:2rem"><h2>${heading}</h2><p>${message}</p></body></html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (err) {
    console.error("[band-unfollow] Error:", err);
    return new Response("An error occurred.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
