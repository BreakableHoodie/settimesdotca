import { scheduled } from "../../_scheduled.js";
import { timingSafeEqual } from "../../utils/crypto.js";

const enc = new TextEncoder();

/**
 * Constant-time comparison for two secret strings.
 * Encodes both as UTF-8 bytes and delegates to timingSafeEqual (Uint8Array XOR
 * accumulate), reusing the helper from functions/utils/crypto.js rather than
 * rolling a new comparison.
 */
function secretsMatch(a, b) {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Length-difference leak is accepted: the secret is high-entropy (256-bit)
  // so its byte-length is not a useful signal to an attacker.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * POST /api/internal/run-scheduled
 *
 * Secret-protected endpoint that invokes the scheduled handler (popularity
 * aggregation + PII retention cleanup + share-link expiry). Called by the
 * .github/workflows/scheduled-jobs.yml GitHub Actions cron workflow because
 * Cloudflare Pages does not support native cron triggers.
 *
 * Authentication: Authorization: Bearer <CRON_SECRET>
 *   or            X-Cron-Secret: <CRON_SECRET>
 *
 * Fail-closed: if CRON_SECRET is unset the endpoint returns 503 and refuses
 * all requests, mirroring the Turnstile / CSRF fail-closed pattern.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Fail closed: CRON_SECRET must be configured in the Cloudflare Pages project.
  if (!env.CRON_SECRET) {
    console.error(
      "[run-scheduled] CRON_SECRET is not configured — refusing request.",
    );
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Accept token from Authorization: Bearer <token> or X-Cron-Secret: <token>.
  const authHeader = request.headers.get("Authorization") ?? "";
  const cronHeader = request.headers.get("X-Cron-Secret") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : cronHeader || null;

  if (!presented || !secretsMatch(presented, env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  try {
    await scheduled({ scheduledTime: start }, env, context);
  } catch (err) {
    console.error("[run-scheduled] scheduled() threw:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    ranAt: new Date(start).toISOString(),
    durationMs: Date.now() - start,
  });
}
