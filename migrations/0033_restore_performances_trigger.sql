-- Migration: 0033_restore_performances_trigger
-- Description: Restore update_performances_timestamp trigger dropped when
--   migration 0032 recreated the performances table. Without this trigger,
--   performances.updated_at is not bumped on UPDATE.

CREATE TRIGGER IF NOT EXISTS update_performances_timestamp
AFTER UPDATE ON performances
BEGIN
  UPDATE performances SET updated_at = datetime('now') WHERE id = NEW.id;
END;
