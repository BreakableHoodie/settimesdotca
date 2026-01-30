-- Deduplicate schedule_builds and add a uniqueness constraint to prevent spam

DELETE FROM schedule_builds
WHERE id NOT IN (
  SELECT MIN(id)
  FROM schedule_builds
  GROUP BY event_id, performance_id, user_session
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_builds_unique
  ON schedule_builds(event_id, performance_id, user_session);
