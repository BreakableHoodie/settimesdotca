// Cloudflare Turnstile server-side verification.
//
// Shared by the public POST endpoints that accept anonymous email input
// (subscriptions/subscribe.js, bands/[name]/follow.js) so the bot-gate logic
// — and especially its fail-closed posture — lives in exactly one place.
//
// SECURITY: when TURNSTILE_SECRET_KEY is unset we fail OPEN only in local dev
// and fail CLOSED in production. A missing or misconfigured secret must never
// silently disable bot protection in prod (mirrors the CSRF_SECRET handling in
// utils/csrf.js). NOTE: this means TURNSTILE_SECRET_KEY MUST be configured in
// the production Pages project, or these endpoints will reject every request.
import { isDevRequest } from "./auth.js";
import { logger } from "./logger.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(request, env, token) {
  const secret = env?.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (isDevRequest(request, env)) {
      console.warn("[Turnstile] TURNSTILE_SECRET_KEY not set — skipping bot verification (local dev only).");
      return true;
    }
    console.error("[Turnstile] TURNSTILE_SECRET_KEY is required in production; rejecting request.");
    return false;
  }

  if (!token || typeof token !== "string") {
    return false;
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", token);
  if (ip) {
    formData.set("remoteip", ip);
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    if (!response.ok) {
      // #673: a siteverify outage (5xx) previously fell through to an empty
      // `{}` body with zero log lines — every follow/subscribe would silently
      // reject with no way to diagnose why. Still fails closed below.
      logger.warn("[Turnstile] siteverify responded with non-2xx status", { status: response.status });
    }

    const result = await response.json().catch(() => ({}));
    return Boolean(result?.success);
  } catch (error) {
    logger.warn("[Turnstile] siteverify request failed", { error });
    return false;
  }
}
