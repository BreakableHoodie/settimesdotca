// Revoke all sessions except the current one
// POST /api/admin/sessions/revoke-all

export async function onRequestPost(context) {
  const { env, data, request } = context;
  const { lucia, user } = data;

  await lucia.invalidateUserSessions(user.userId);

  const newSession = await lucia.createSession(user.userId, {});

  await env.DB.prepare(
    `UPDATE lucia_sessions
     SET ip_address = ?, user_agent = ?, remember_me = ?
     WHERE id = ?`
  )
    .bind(
      request.headers.get("CF-Connecting-IP"),
      request.headers.get("User-Agent"),
      0,
      newSession.id
    )
    .run();

  const cookie = lucia.createSessionCookie(newSession.id);

  return new Response(
    JSON.stringify({
      success: true,
      message: "All other sessions revoked",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie.serialize(),
      },
    }
  );
}
