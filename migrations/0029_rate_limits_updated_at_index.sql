-- Migration: Add index on rate_limits.updated_at
--
-- The retention job deletes stale rate_limits rows by updated_at. Without an
-- index, this requires a full table scan which can time out under a large
-- table (e.g., after a sustained IP-spray attack). This index makes the
-- DELETE O(log n) + rows deleted instead of O(n).

CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits (updated_at);
