// GET /api/bands/:name/unfollow?token=...
// Deletes the band follow associated with the unsubscribe token.
// Returns 200 regardless of whether the token exists (avoid enumeration).

import { escapeHtml } from "../../../utils/html.js";
import { emailActionPage, readEmailActionToken } from "../../../utils/emailActionPage.js";

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

    if (!token || token.length > 256) {
      return new Response("Invalid token.", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Resolve the band name BEFORE deleting so the page can name it. An unknown
    // token yields no row → a generic message (still 200), so the response never
    // reveals whether a token was valid.
    const follow = await DB.prepare(
      `SELECT bp.name AS band_name
       FROM band_follows bf
       JOIN band_profiles bp ON bp.id = bf.band_profile_id
       WHERE bf.unsubscribe_token = ?`,
    )
      .bind(token)
      .first();

    await DB.prepare("DELETE FROM band_follows WHERE unsubscribe_token = ?").bind(token).run();

    const bandName = follow?.band_name ? escapeHtml(follow.band_name) : null;
    const heading = bandName ? `Unfollowed ${bandName}` : "Unfollowed";
    const message = bandName
      ? `You've been removed from ${bandName}'s follower list — you won't get any more emails about them.`
      : `You have been removed from this band's follower list.`;

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
