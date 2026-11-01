// Per-RECIPIENT cap on the emails the public, unauthenticated senders may send (#1337).
//
// The per-IP limits in rateLimit.js say nothing about how many emails ONE inbox
// receives: a bot that rotates IPs could send a single address
// one confirmation per band in the catalogue, all billed to us and all counting
// against our sender reputation. This caps the address instead, whatever IPs the
// requests come from.
//
// Used by resend-activation (the fan-facing follow and subscribe senders were
// removed): one window, one counter per address.
//
// The key is a SHA-256 digest of the normalised address, never the address itself:
// `rate_limits` is pruned on a timer and must not become a second place that
// stores email addresses in the clear.

import { checkRateLimitByKey } from "./rateLimit.js";

export const RECIPIENT_EMAIL_CAP = 5;
export const RECIPIENT_EMAIL_WINDOW_SECONDS = 24 * 60 * 60;
export const RECIPIENT_KEY_PREFIX = "email-recipient:";
// How long the retention job keeps an idle counter: the window plus an hour of buffer.
// Pruned sooner than the window and the cap would reset itself. Matches the "about 25
// hours" the privacy policy states for rate-limit counters.
export const RECIPIENT_KEY_RETENTION_SECONDS = RECIPIENT_EMAIL_WINDOW_SECONDS + 60 * 60;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Count one email to `email` against its 24 h allowance.
 * Returns `{ allowed, reason, logId }`: reason is "capped" (a real over-cap) or
 * "counter_unavailable" (the counter could not be written) when `allowed` is false.
 * Fails CLOSED either way: a D1 error suppresses the email rather than uncapping it.
 * The two reasons are told apart because they mean different things to whoever reads
 * the logs: one is abuse protection working, the other is an outage.
 *
 * `logId` is the first 8 hex chars of the digest, the only form of the address that
 * may be logged. Callers skip the send, return their normal success response, and
 * report through logRecipientSuppression().
 */
export async function allowEmailToRecipient(DB, email) {
  const hash = await sha256Hex(String(email).trim().toLowerCase());
  const logId = hash.slice(0, 8);
  const result = await checkRateLimitByKey(
    DB,
    `${RECIPIENT_KEY_PREFIX}${hash}`,
    { requests: RECIPIENT_EMAIL_CAP, window: RECIPIENT_EMAIL_WINDOW_SECONDS },
    { recipientHash: logId },
  );
  if (result.allowed) return { allowed: true, reason: null, logId };
  return { allowed: false, reason: result.failed ? "counter_unavailable" : "capped", logId };
}

/** Log a suppressed send at the level its reason deserves. Never logs the address. */
export function logRecipientSuppression(tag, { reason, logId }) {
  if (reason === "counter_unavailable") {
    console.error("[%s] Recipient cap unavailable; email suppressed (fail-closed): %s", tag, logId);
  } else {
    console.warn("[%s] Recipient email cap reached; email not sent: %s", tag, logId);
  }
}

/** First 8 hex chars of the recipient digest, for logs. */
export async function recipientLogId(email) {
  return (await sha256Hex(String(email).trim().toLowerCase())).slice(0, 8);
}
