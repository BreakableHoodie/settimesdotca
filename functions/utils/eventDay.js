// "Today" for event-day classification, anchored to the events' local timezone.
//
// The platform's events are Ontario-local (Waterloo Region and southern
// Ontario), so the calendar day that decides whether an event is happening
// now / upcoming / past must be the REGION'S local day — never the UTC day.
// `new Date().toISOString().slice(0, 10)` flips to tomorrow at 8:00 PM
// Eastern (EDT), which marked events "Happening Now" the evening before
// (Bad Livin' Roadshow 3, 2026-07-09) and moved a band's in-progress show
// into "past shows" mid-set.
//
// `en-CA` formats as YYYY-MM-DD, so the result stays safe for the repo's
// lexicographic date comparisons (documented invariant: never
// `new Date('YYYY-MM-DD')`).

const TORONTO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * @param {Date} [now] - injectable for tests; defaults to the current instant
 * @returns {string} the current calendar date in America/Toronto, YYYY-MM-DD
 */
export function eventLocalToday(now = new Date()) {
  return TORONTO_DAY.format(now);
}
