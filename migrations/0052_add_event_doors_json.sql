-- Migration: 0052_add_event_doors_json
-- Adds doors_json for per-day doors/gates-open times (#569).
-- JSON map of festival date -> 24h time, e.g.
-- {"2026-07-10":"16:00","2026-07-11":"10:00"}. NULL means "no doors info" —
-- current behaviour everywhere (display and "started"/"Happening Now" gating
-- both no-op when this is absent).

ALTER TABLE events ADD COLUMN doors_json TEXT;
