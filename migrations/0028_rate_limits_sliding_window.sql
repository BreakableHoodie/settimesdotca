-- Migration: Add rate_limits table for globally-consistent fixed-window rate limiting
--
-- The existing Cache API rate limiter is PoP-local (per Cloudflare edge node),
-- which allows distributed brute-force attacks across multiple geographic regions
-- to bypass rate limits. This table provides a globally-consistent fixed-window counter
-- backed by D1, used for security-sensitive endpoints (auth, subscriptions).
--
-- Non-sensitive public endpoints (events, schedule, feeds) continue to use the
-- Cache API (fail-open is acceptable there; the goal is DoS protection, not
-- security enforcement).

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
