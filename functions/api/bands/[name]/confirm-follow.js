// GET /api/bands/:name/confirm-follow?token=...
// Confirms a pending (double opt-in) band follow: sets verified=1 and clears the
// one-time verification token. Only verified follows receive announcement emails
// (see admin/bands/[id].js + resend-announcement.js). Returns a friendly HTML
// page; messaging is generic to avoid leaking whether a given token was valid.

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const htmlPage = (heading, body) =>
  new Response(
    `<html><body style="font-family:sans-serif;padding:2rem"><h2>${heading}</h2><p>${body}</p></body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
    },
  );

export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token || token.length > 256) {
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
       WHERE bf.verification_token = ?`,
    )
      .bind(token)
      .first();

    if (!row) {
      // Token invalid, already used, or expired — keep it generic.
      return htmlPage(
        "Link expired",
        "This confirmation link is invalid or has already been used. If you already confirmed, you're all set.",
      );
    }

    // Verify and clear the one-time token in one statement. This is idempotent:
    // a second click finds no matching token (already NULL) and changes nothing.
    await DB.prepare(
      "UPDATE band_follows SET verified = 1, verification_token = NULL WHERE id = ?",
    )
      .bind(row.id)
      .run();

    return htmlPage(
      `You're following ${escapeHtml(row.band_name)}`,
      "We'll email you when they join a lineup. You can unsubscribe anytime from those emails.",
    );
  } catch (err) {
    console.error("[band-confirm-follow] Error:", err);
    return new Response("An error occurred.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
