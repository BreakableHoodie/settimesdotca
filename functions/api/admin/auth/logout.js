// Admin logout endpoint
// POST /api/admin/auth/logout
// Clears session cookie and invalidates session

import { deleteSessionCookie, getCookie } from "../../../utils/cookies.js";
import { deleteCSRFCookie } from "../../../utils/csrf.js";
import { getClientIP } from "../../../utils/request.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get("User-Agent") || "unknown";

  try {
    // Get session token from cookie
    const sessionToken = getCookie(request, "session_token");

    if (sessionToken) {
      // Get user ID from session before deleting
      const session = await DB.prepare(
        `SELECT user_id FROM sessions WHERE session_token = ?`,
      )
        .bind(sessionToken)
        .first();

      // Delete session from database
      await DB.prepare(`DELETE FROM sessions WHERE session_token = ?`)
        .bind(sessionToken)
        .run();

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
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", deleteSessionCookie(request));
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
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", deleteSessionCookie(request));
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
