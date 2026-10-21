-- #1249: "venue running late +N min".
--
-- One row per (event, venue) holding that venue's CUMULATIVE delay for the
-- fan banner ("Blue Room is running about 15 minutes late"). The set times
-- themselves are shifted in `performances`; this row is the banner and the
-- concurrency anchor for those shifts.
--
-- revision + last_shift_id make a shift race-safe in one DB.batch: the first
-- statement claims this row by compare-and-swap on `revision` and stamps the
-- request's nonce into `last_shift_id`; every performance UPDATE and the audit
-- row then apply only WHERE EXISTS(last_shift_id = that nonce). A request that
-- loses the race writes nothing, so two simultaneous "+15" taps never stack.
-- (D1 rolls a batch back on an ERROR, not on an UPDATE that matches nothing,
-- so per-row predicates alone could commit half a shift.)
CREATE TABLE IF NOT EXISTS event_venue_delays (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 600),
  revision INTEGER NOT NULL DEFAULT 1,
  last_shift_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, venue_id)
);
