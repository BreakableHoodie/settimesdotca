-- #1246 Q1: the show-night usage curve. "When do fans use the site on show night?"
--
-- One row per (event, festival date, Toronto hour) holding a COUNT of event-page
-- views. Written by POST /api/metrics from `event_view` only, and only on the
-- event's own festival dates (date..end_date), so it is a show-night curve, not
-- a year-round traffic log. Aggregate counts only: there is no visitor key of
-- any kind, so nothing here can be linked to a person.
--
-- festival_date is the FESTIVAL day, not the calendar day: a view at 01:30 after
-- the show lands on the previous evening's date at hour 1 (eventLocalFestivalToday).
-- Rows go with the event (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS event_hourly_views (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  festival_date TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (event_id, festival_date, hour)
);
