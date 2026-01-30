// Admin logout endpoint
// POST /api/admin/auth/logout
// Clears session cookie and invalidates session

import { getCookie } from "../../../utils/cookies.js";
import { deleteCSRFCookie } from "../../../utils/csrf.js";
import { getClientIP } from "../../../utils/request.js";
import { initializeLucia } from "../../../utils/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get("User-Agent") || "unknown";

  try {
    // Get session token from cookie
    const allowHeaderAuth = env?.ALLOW_HEADER_AUTH === "true";
    const sessionToken =
      getCookie(request, "session_token") ||
      (allowHeaderAuth
        ? request.headers.get("Authorization")?.replace("Bearer ", "")
        : null);

    if (sessionToken) {
      // Get user ID from session before deleting
      const session = await DB.prepare(
        `SELECT user_id FROM lucia_sessions WHERE id = ?`,
      )
        .bind(sessionToken)
        .first();

      const lucia = initializeLucia(DB, request);
      await lucia.invalidateSession(sessionToken);

      // Log logout
      if (session) {
        await DB.prepare(
          `INSERT INTO auth_attempts (user_id, ip_address, user_agent, attempt_type, success)
           VALUES (?, ?, ?, 'logout', 1)`,
        )
          .bind(session.user_id, ipAddress, userAgent)
          .run();
      }
    }

    // Clear session cookie (even if no session found)
    const lucia = initializeLucia(DB, request);
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());
    headers.append("Set-Cookie", deleteCSRFCookie(request));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Logged out successfully",
      }),
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error("Logout error:", error);

    // Even if there's an error, clear the cookie
    const lucia = initializeLucia(DB, request);
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());
    headers.append("Set-Cookie", deleteCSRFCookie(request));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Logged out",
      }),
      {
        status: 200,
        headers,
      },
    );
  }
}
