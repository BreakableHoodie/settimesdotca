// Step-up re-authentication for identity changes (#1324).
//
// A session that has been open for hours proves nothing about who is at the
// keyboard now. Changing who can sign in, and as what, therefore needs a fresh
// proof of the second factor: POST /api/admin/mfa/step-up stamps
// lucia_sessions.step_up_at, and the routes listed in STEP_UP_POLICY
// (functions/api/admin/__tests__/stepUpBoundaries.test.js) call
// requireRecentStepUp() before their first write.
//
// The stamp is per SESSION, never per user: another browser session of the same
// account gains nothing from it, and every new session starts un-stepped-up.
// API keys are refused outright. A key borrows its creator's identity but has
// no second factor to present.

export const STEP_UP_WINDOW_SECONDS = 300;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Returns null when the caller may proceed, or a Response to return as-is.
// Fails closed: no session, no stamp, a stale stamp or a database error all
// refuse. Call it after checkPermission and before any write, email or token.
export async function requireRecentStepUp(context) {
  if (context.data?.apiKey) {
    return jsonResponse(403, {
      error: "Forbidden",
      code: "STEP_UP_KEY_FORBIDDEN",
      message: "API keys cannot perform this action. Sign in with a session.",
    });
  }

  const sessionId = context.data?.session?.id;
  const userId = context.data?.session?.user_id;
  const required = () =>
    jsonResponse(403, {
      error: "Forbidden",
      code: "STEP_UP_REQUIRED",
      message: "Confirm with your 2FA code to continue.",
    });
  if (!sessionId || userId === undefined || userId === null) return required();

  try {
    const row = await context.env.DB.prepare(
      `SELECT 1 AS ok FROM lucia_sessions
       WHERE id = ? AND user_id = ? AND step_up_at IS NOT NULL AND step_up_at > unixepoch() - ?`,
    )
      .bind(sessionId, userId, STEP_UP_WINDOW_SECONDS)
      .first();
    return row ? null : required();
  } catch (error) {
    console.error("[StepUp] Failed to read step-up state:", error?.message || error);
    return jsonResponse(503, {
      error: "Service unavailable",
      code: "STEP_UP_UNAVAILABLE",
      message: "Could not confirm your 2FA status. Try again.",
    });
  }
}
