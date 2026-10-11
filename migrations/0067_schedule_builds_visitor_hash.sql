-- Replace the raw browser identifier with an event-scoped value.
-- Existing rows cannot be hashed in SQLite, so preserve their exact distinct
-- builder counts with labels that contain no part of the original identifier.
ALTER TABLE schedule_builds RENAME COLUMN user_session TO visitor_hash;

DROP INDEX IF EXISTS idx_schedule_builds_unique;
DROP INDEX IF EXISTS idx_schedule_builds_session;

WITH ranked AS (
  SELECT
    id,
    'anon:' || DENSE_RANK() OVER (PARTITION BY event_id ORDER BY visitor_hash) AS anonymized_value
  FROM schedule_builds
)
UPDATE schedule_builds
SET visitor_hash = (
  SELECT anonymized_value
  FROM ranked
  WHERE ranked.id = schedule_builds.id
);

CREATE UNIQUE INDEX idx_schedule_builds_unique
  ON schedule_builds(event_id, performance_id, visitor_hash);
