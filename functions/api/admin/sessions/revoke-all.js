// Revoke all sessions except the current one
// POST /api/admin/sessions/revoke-all

import { generateCSRFToken, setCSRFCookie } from "../../../utils/csrf.js";

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

  const csrfToken = generateCSRFToken(request, env, newSession.id);

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", lucia.createSessionCookie(newSession.id).serialize());
  headers.append("Set-Cookie", setCSRFCookie(csrfToken, request, env));

  return new Response(
    JSON.stringify({
      success: true,
      message: "All other sessions revoked",
    }),
    { headers }
  );
}
