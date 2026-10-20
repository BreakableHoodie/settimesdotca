// The guess-limit flow shared by every authenticated endpoint that takes a
// second-factor code from a live session (step-up's own copy lives in
// mfa/step-up.js; backup-codes, disable, and re-enrolment setup and its
// confirmation in mfa/enable use this) (#1324, #1318).
//
//   1. record the attempt as a failed `pending` row BEFORE the code is checked,
//      so parallel guesses count each other;
//   2. per-USER limit across every guessing endpoint, no IP in the key: hitting
//      it DELETES the session and answers 401 STEP_UP_LOCKED;
//   3. per-IP limit: 429;
//   4. the caller settles the row with the outcome (never a second row).
//
// Both limits count the row just written, hence the `+ 1`.

import {
  AUTH_ATTEMPT_TYPES,
  MFA_GUESS_LIMIT,
  checkAuthRateLimit,
  mfaGuessAttemptTypes,
  settleAuthAttempt,
  writeAuthAttempt,
} from "./authAttempts.js";

const IP_LIMIT = 5;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Never throws: the work being recorded has already happened or already failed.
export async function settleQuietly(DB, id, outcome) {
  try {
    await settleAuthAttempt(DB, id, outcome);
  } catch (error) {
    console.error("[MFA] Failed to settle auth attempt:", error?.message || error);
  }
}

// Returns { attemptId, response }. A non-null `response` is a refusal to return
// as-is (the attempt is already settled as a failure).
export async function beginMfaGuess(DB, { attemptType, email, userId, ipAddress, userAgent, sessionId }) {
  const attemptId = await writeAuthAttempt(DB, {
    attemptType,
    email,
    failureReason: "pending",
    ipAddress,
    success: false,
    userAgent,
    userId,
  });

  const userLimit = await checkAuthRateLimit(DB, {
    attemptType,
    attemptTypes: mfaGuessAttemptTypes(),
    maxFailures: MFA_GUESS_LIMIT.maxFailures + 1,
    scope: "user",
    userId,
    windowMs: MFA_GUESS_LIMIT.windowMs,
  });
  if (!userLimit.allowed) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "user_locked" });
    if (sessionId) {
      await DB.prepare("DELETE FROM lucia_sessions WHERE id = ?").bind(sessionId).run();
    }
    return {
      attemptId,
      response: json(401, {
        error: "Session ended",
        code: "STEP_UP_LOCKED",
        message: "Too many failed confirmation attempts. Sign in again.",
      }),
    };
  }

  const ipLimit = await checkAuthRateLimit(DB, {
    attemptType,
    ipAddress,
    maxFailures: IP_LIMIT + 1,
    scope: "user-and-ip",
    userId,
  });
  if (!ipLimit.allowed) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "rate_limited" });
    return {
      attemptId,
      response: json(429, {
        error: "Too many attempts",
        message: `Too many failed attempts. Please try again in ${ipLimit.remainingMinutes} minutes.`,
      }),
    };
  }

  return { attemptId, response: null };
}

export { AUTH_ATTEMPT_TYPES };
