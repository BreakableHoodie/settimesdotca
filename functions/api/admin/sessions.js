// Session management endpoints
// GET /api/admin/sessions
// DELETE /api/admin/sessions

export async function onRequestGet(context) {
  const { env, data } = context;
  const { user, session } = data;

  try {
    const result = await env.DB.prepare(
      `
      SELECT
        id,
        ip_address,
        user_agent,
        created_at,
        last_activity_at,
        expires_at
      FROM lucia_sessions
      WHERE user_id = ?
      ORDER BY last_activity_at DESC
    `
    )
      .bind(user.userId)
      .all();

    const sessions = (result.results || []).map((row) => ({
      ...row,
      expires_at: row.expires_at ? new Date(row.expires_at * 1000).toISOString() : null,
    }));

    return new Response(
      JSON.stringify({
        sessions,
        currentSessionId: session?.id || session?.session_token || null,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Failed to load sessions:", error);
    return new Response(
      JSON.stringify({ error: "Failed to load sessions" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestDelete(context) {
  const { request, env, data } = context;
  const { lucia, user } = data;

  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = body.sessionId;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Session ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionRow = await env.DB.prepare(
      "SELECT user_id FROM lucia_sessions WHERE id = ?"
    )
      .bind(sessionId)
      .first();

    if (!sessionRow || sessionRow.user_id !== user.userId) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await lucia.invalidateSession(sessionId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return new Response(
      JSON.stringify({ error: "Failed to delete session" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
