// Unsubscribe endpoint
// GET /api/subscriptions/unsubscribe?token=xxx

// HTML escape function to prevent XSS
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing unsubscribe token", { status: 400 });
  }

  try {
    // Find subscription
    const { results } = await env.DB.prepare(
      `
      SELECT id, email, city, genre
      FROM email_subscriptions
      WHERE unsubscribe_token = ?
    `,
    )
      .bind(token)
      .all();

    if (results.length === 0) {
      return new Response("Invalid unsubscribe token", { status: 404 });
    }

    const subscription = results[0];

    // Delete subscription
    await env.DB.prepare(
      `
      DELETE FROM email_subscriptions
      WHERE id = ?
    `,
    )
      .bind(subscription.id)
      .run();

    // Log unsubscribe
    await env.DB.prepare(
      `
      INSERT INTO subscription_unsubscribes (subscription_id)
      VALUES (?)
    `,
    )
      .bind(subscription.id)
      .run();

    // Return success page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: system-ui, sans-serif;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              color: white;
              margin: 0;
              padding: 2rem;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #ff6b35; }
            p { opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Unsubscribed</h1>
            <p>You've been removed from ${escapeHtml(subscription.city)} ${escapeHtml(subscription.genre)} show notifications.</p>
            <p>You can resubscribe anytime at <a href="${escapeHtml(env.PUBLIC_URL)}/subscribe" style="color: #ff6b35;">${escapeHtml(env.PUBLIC_URL)}/subscribe</a></p>
          </div>
        </body>
      </html>
    `,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return new Response("Unsubscribe failed", { status: 500 });
  }
}
