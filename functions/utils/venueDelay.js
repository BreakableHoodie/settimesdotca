// "Venue running late +N min" (#1249): which sets a shift moves, and where to.
//
// Pure: no database, so every rule here is testable on its own. The handler
// (api/admin/events/[id]/venues/[venueId]/delay.js) reads, plans with this,
// checks conflicts on the final arrangement, and writes one batch.
//
// Times are compared in FESTIVAL minutes: minutes since the festival day's
// midnight, with after-midnight times (before AFTER_MIDNIGHT_THRESHOLD_HOUR)
// counted past 24:00, so 00:05 sorts after 23:50 (CLAUDE.md "After-midnight
// band sorting"). A festival day runs from 06:00 to 06:00 the next morning.
import { AFTER_MIDNIGHT_THRESHOLD_HOUR, eventLocalClock, eventLocalFestivalToday } from "./eventDay.js";
import { toMinutes } from "./timeConflicts.js";

export const MAX_SHIFT_MINUTES = 180;
export const MAX_TOTAL_DELAY_MINUTES = 600;

const DAY_MINUTES = 24 * 60;
const THRESHOLD_MINUTES = AFTER_MIDNIGHT_THRESHOLD_HOUR * 60;
const FESTIVAL_DAY_END = THRESHOLD_MINUTES + DAY_MINUTES;

export function festivalMinutes(time) {
  const minutes = toMinutes(time);
  return minutes < THRESHOLD_MINUTES ? minutes + DAY_MINUTES : minutes;
}

function toClock(festivalMinute) {
  const minutes = ((festivalMinute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// A set has started once its festival day is past, or it is today's festival
// day and its start is at or before now, on the Toronto clock (never UTC).
export function hasStarted(performance, eventDate, now = new Date()) {
  const today = eventLocalFestivalToday(now);
  const day = performance.performance_date || eventDate;
  if (day < today) return true;
  if (day > today) return false;
  return festivalMinutes(performance.start_time) <= festivalMinutes(eventLocalClock(now).time);
}

/**
 * Plan a shift of `minutes` for the remaining sets at one venue.
 *
 * @returns {{ changes: Array, crossing: Array }} `changes` carries each moved
 *   set's from/to times; `crossing` lists sets the shift would push across the
 *   06:00 festival-day line. The caller must refuse the whole shift if
 *   `crossing` is non-empty: moving a set across that line silently changes
 *   which festival day it belongs to, which no shift should do.
 */
export function planVenueShift(performances, { venueId, minutes, eventDate, now = new Date() }) {
  const changes = [];
  const crossing = [];
  for (const performance of performances) {
    if (performance.venue_id !== venueId) continue;
    if (performance.is_cancelled) continue;
    if (!performance.start_time) continue;
    if (hasStarted(performance, eventDate, now)) continue;

    const start = festivalMinutes(performance.start_time);
    const newStart = start + minutes;
    let end = null;
    let newEnd = null;
    if (performance.end_time) {
      end = festivalMinutes(performance.end_time);
      if (end <= start) end += DAY_MINUTES;
      newEnd = end + minutes;
    }
    // Refuse only a shift that MOVES a start or end across 06:00. A set that
    // already ends after 06:00 (05:00-07:00) is on the far side before and
    // after, and must not block every shift at its venue (Vera, #1249 review).
    const startInDay = (fm) => fm >= THRESHOLD_MINUTES && fm < FESTIVAL_DAY_END;
    const endInDay = (fm) => fm > THRESHOLD_MINUTES && fm <= FESTIVAL_DAY_END;
    const startCrosses = startInDay(start) !== startInDay(newStart);
    const endCrosses = end !== null && endInDay(end) !== endInDay(newEnd);
    if (startCrosses || endCrosses) {
      crossing.push({ id: performance.id, name: performance.name ?? null, startTime: performance.start_time });
      continue;
    }
    changes.push({
      id: performance.id,
      name: performance.name ?? null,
      from: { startTime: performance.start_time, endTime: performance.end_time ?? null },
      to: { startTime: toClock(newStart), endTime: newEnd === null ? null : toClock(newEnd) },
    });
  }
  return { changes, crossing };
}
