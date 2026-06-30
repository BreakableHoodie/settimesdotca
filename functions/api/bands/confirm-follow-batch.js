// GET /api/bands/confirm-follow-batch?token=<batch_token>
// Confirms all pending (verified=0) band follows that share the given batch_token.
//
// The batch_token is shared across every band_follows row created by a single
// POST /api/bands/follow-batch request. One click here verifies all of them.
//
// Idempotent: the UPDATE clears batch_token to NULL on first click, so a second
// click finds no matching rows and changes nothing — the fan still sees a success
// page without any error. Messaging is generic to avoid revealing whether a given
// token was valid (no enumeration).

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

    // Verify all pending follows in this batch and clear the shared token in one
    // statement. Idempotent: on a second click the batch_token is already NULL so
    // no rows match, changes=0, and the fan still sees the success page.
    await DB.prepare(
      `UPDATE band_follows
       SET verified = 1, verification_token = NULL, batch_token = NULL
       WHERE batch_token = ? AND verified = 0`,
    )
      .bind(token)
      .run();

    return htmlPage(
      "You're all set!",
      "We'll email you when your bands join a lineup. You can unsubscribe anytime from those emails.",
    );
  } catch (err) {
    console.error("[band-confirm-follow-batch] Error:", err);
    return new Response("An error occurred.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
