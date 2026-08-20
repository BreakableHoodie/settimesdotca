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

// The after-midnight convention, server-side. A set starting before 6 AM
// belongs to the PREVIOUS evening, so between local midnight and 06:00 the
// festival day is still yesterday's date.
//
// The canonical home for this number is frontend/src/utils/festivalDays.js,
// but Pages Functions cannot import from frontend/, so the server needs its
// own definition. This is that ONE definition on this side of the build
// boundary (#746) -- import from here; never write `6` or `"06:00"` again.
export const AFTER_MIDNIGHT_THRESHOLD_HOUR = 6;

// Same threshold, as a zero-padded "HH:MM" string. Two shapes exist because
// callers need two different comparisons: eventLocalFestivalToday() below
// does numeric hour arithmetic (`hour >= AFTER_MIDNIGHT_THRESHOLD_HOUR`),
// while functions/api/events/timeline.js compares against
// performances.start_time ("HH:MM") lexicographically, the same trick this
// repo uses throughout for YYYY-MM-DD dates. DERIVED from the number, never
// typed as a literal, so the two shapes cannot drift apart.
export const AFTER_MIDNIGHT_THRESHOLD_TIME = `${String(AFTER_MIDNIGHT_THRESHOLD_HOUR).padStart(2, "0")}:00`;

/**
 * The current FESTIVAL day in America/Toronto — the calendar day, except
 * between local midnight and AFTER_MIDNIGHT_THRESHOLD_HOUR, when it is still
 * the previous date.
 *
 * Use this, not `eventLocalToday()`, for any "is this event still current?"
 * question. At 00:15 on show night the calendar has rolled over but the event
 * has not: a fan is standing outside the venue while after-midnight sets are
 * still playing. Classifying the night as "past" there drops a cancelled set
 * off the artist page at exactly the moment someone checks whether it is
 * still on (#732).
 *
 * @param {Date} [now] - injectable for tests; defaults to the current instant
 * @returns {string} the current festival date in America/Toronto, YYYY-MM-DD
 */
export function eventLocalFestivalToday(now = new Date()) {
  const { date, time } = eventLocalClock(now);
  const hour = Number(time.slice(0, 2));
  if (!Number.isFinite(hour) || hour >= AFTER_MIDNIGHT_THRESHOLD_HOUR) {
    return date;
  }
  // Step back a CALENDAR day, not 86_400_000ms: on a DST boundary a local day
  // is 23 or 25 hours long, so fixed-millisecond arithmetic lands on the wrong
  // date. `date` is already the Toronto-local Y-M-D, so building a UTC instant
  // from its parts and decrementing the day lets Date normalise month and year
  // rollovers without ever re-entering a timezone conversion.
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  const pad = (value) => String(value).padStart(2, "0");
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`;
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

// Formats the America/Toronto UTC offset ("GMT-04:00" / "GMT-05:00") for a
// given instant. `longOffset` (not `shortOffset`) is required for a
// consistently zero-padded "±HH:MM" — some ICU builds render shortOffset
// without the leading zero (e.g. "GMT-4").
const TORONTO_OFFSET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto",
  timeZoneName: "longOffset",
});

/**
 * Returns the America/Toronto UTC offset ("-04:00" EDT or "-05:00" EST) in
 * effect on a given YYYY-MM-DD calendar date, for embedding in a schema.org
 * date literal (e.g. MusicEvent.startDate). A hardcoded "-04:00" is wrong for
 * roughly five months a year (EST, e.g. a February event) — this delegates
 * to Intl's ICU timezone tables instead of hand-rolling DST cutover math,
 * which drifts without the platform's tz database.
 *
 * Probes at noon UTC on the given date (07:00–08:00 Toronto): Toronto's DST
 * transitions land at 2 AM local, so this instant is always past the cutover
 * and on the same calendar date being asked about — never ambiguous.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} e.g. "-04:00"; falls back to "-05:00" (EST) if dateStr
 *   is missing/malformed rather than throwing.
 */
export function torontoUtcOffset(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return "-05:00";
  }
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const gmt = TORONTO_OFFSET.formatToParts(probe).find((p) => p.type === "timeZoneName")?.value;
  return gmt ? gmt.replace("GMT", "") : "-05:00";
}

/**
 * YYYY-MM-DD → the following calendar day.
 *
 * DST-proof because the input is a date *literal*, not a moment in time: it is
 * read at UTC midnight and stepped with UTC math, so it never crosses a Toronto
 * DST boundary and gains or loses an hour. `torontoUtcOffset` above is the tool
 * for the opposite question — where a real instant falls.
 *
 * Lived in `api/feeds/ical.js` and `event/[slug].js` as byte-identical copies,
 * the second carrying a "mirrors the other one" comment. Unlike `parseOrigin`
 * and `sortableName`, nothing forced that split — both callers are inside
 * `functions/`, so no build boundary separates them.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
export function nextCalendarDay(dateStr) {
  const next = new Date(`${dateStr}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD → the preceding calendar day. See {@link nextCalendarDay}.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
export function previousCalendarDay(dateStr) {
  const prev = new Date(`${dateStr}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}
