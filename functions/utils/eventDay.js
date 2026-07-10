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

// Same reasoning as TORONTO_DAY above, but also extracts the clock time —
// needed to gate an event's FIRST day on its doors/gates-open time (#569):
// "today" alone can't tell you whether doors have opened yet. `hour12: false`
// plus a manual "24:MM" -> "00:MM" fix (see eventLocalClock) keeps the output
// zero-padded HH:MM so it stays safe for the repo's string comparisons.
const TORONTO_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * @param {Date} [now] - injectable for tests; defaults to the current instant
 * @returns {string} the current calendar date in America/Toronto, YYYY-MM-DD
 */
export function eventLocalToday(now = new Date()) {
  return TORONTO_DAY.format(now);
}

/**
 * @param {Date} [now] - injectable for tests; defaults to the current instant
 * @returns {{ date: string, time: string }} the current America/Toronto
 *   calendar date (YYYY-MM-DD) and clock time (zero-padded 24h HH:MM),
 *   comparable lexicographically against `doors_json` values (#569).
 */
export function eventLocalClock(now = new Date()) {
  const date = TORONTO_DAY.format(now);
  // Some ICU implementations format midnight as "24:00" under hour12: false;
  // normalize to "00:MM" so string comparisons against HH:MM doors times
  // never break at exactly midnight.
  const time = TORONTO_TIME.format(now).replace(/^24:/, "00:");
  return { date, time };
}
