// Date and time validation utilities: ISO dates, HH:MM times, festival-day
// spans, and the events.doors_json map. Split out of validation.js (#906) —
// see that file's header for why.

import { FIELD_LIMITS } from "./fieldLimits.js";

/**
 * ISO 8601 date format regex
 * Matches YYYY-MM-DD and full ISO datetime formats
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * 24-hour "HH:MM" time regex for `events.doors_json` values (#569).
 */
const DOORS_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate date string (ISO 8601 format)
 * Strictly validates ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO date format
 */
/**
 * True when a YYYY-MM-DD string names a date that actually exists.
 *
 * The trap this exists for: `new Date('2025-02-29')` does not fail, it rolls
 * over to March 1 and reports itself valid. So a format check plus a parse
 * check accepts 2025-02-29 and 2025-04-31 — the value is then stored as typed
 * while meaning a different day, and never matches a real event date under this
 * repo's lexicographic YYYY-MM-DD comparisons.
 *
 * `new Date(year, month, 0).getDate()` gives the last day of `month` (month is
 * 1-based here because day 0 rolls back from the following month), which is
 * leap-year correct without a hand-written February rule.
 *
 * Shared so `isValidISODate` and `validateDate` cannot disagree about which
 * dates exist — they did: validateDate rejected 2025-02-29 while isValidISODate
 * accepted it.
 *
 * @param {number} year
 * @param {number} month - 1-12
 * @param {number} day
 * @returns {boolean}
 */
export function isRealCalendarDate(year, month, day) {
  if (month < 1 || month > 12) {
    return false;
  }
  // setFullYear rather than the Date constructor: `new Date(year, ...)` remaps
  // years 0-99 to 1900-1999, so year 0 was evaluated as 1900 — which is not a
  // leap year, while year 0 is (divisible by 400). That rejected 0000-02-29.
  const probe = new Date(0);
  probe.setFullYear(year, month, 0);
  return day >= 1 && day <= probe.getDate();
}

export function isValidISODate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return false;
  }

  // First check if format matches ISO 8601
  if (!ISO_DATE_REGEX.test(dateString)) {
    return false;
  }

  // Format alone is not enough: new Date('2025-02-29') rolls over to March 1
  // rather than failing, so a parse check accepts dates that do not exist.
  //
  // Only the leading YYYY-MM-DD is examined. ISO_DATE_REGEX also accepts a full
  // datetime, and splitting the whole string on "-" yields NaN for the day of
  // "2025-11-18T14:00:00Z" — which would reject every timestamp this function
  // has always accepted.
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  return isRealCalendarDate(year, month, day);
}

/**
 * Validate time format (HH:MM) and logical validity
 * @param {string} time - Time string to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function isValidTime(time) {
  if (!time || typeof time !== "string") {
    return { valid: false, error: "Time is required" };
  }

  // Check format
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { valid: false, error: "Time must be in HH:MM format" };
  }

  // Check logical validity
  const [hours, minutes] = time.split(":").map(Number);
  if (hours < 0 || hours > 23) {
    return { valid: false, error: "Hours must be between 00 and 23" };
  }
  if (minutes < 0 || minutes > 59) {
    return { valid: false, error: "Minutes must be between 00 and 59" };
  }

  return { valid: true, error: undefined };
}

/**
 * Reject a zero-length set — a performance whose end time equals its start.
 *
 * This is the canonical home for that rule. It existed inline, worded
 * differently, on two of the four write paths that accept a user-supplied
 * start AND end time, and not at all on the other two (`bands/import.js`, and
 * the PATCH in `bands/[id].js` — the path an operator actually uses to move a
 * set time during a show).
 *
 * The rule matters because a zero-length set is read two incompatible ways.
 * `normalizeEndMinutes` in `functions/utils/timeConflicts.js` treated
 * `end <= start` as a midnight crossing and added 24 hours, making the set
 * conflict with everything at its venue; the frontend's copy in
 * `frontend/src/admin/utils/timeUtils.js` used `end < start`, leaving a
 * zero-width interval that `intervalsOverlap` (strict `<`) matches against
 * nothing. Server and admin UI therefore disagreed about the same row.
 *
 * Rejecting the input is the fix rather than picking a side: a band plays
 * neither 0 minutes nor 24 hours, so both readings were wrong. With the input
 * impossible, the two comparisons cannot disagree — they are aligned anyway so
 * they cannot drift apart again.
 *
 * `end < start` stays legal: that is a real after-midnight set (23:30–00:30),
 * and 5 exist in production. A missing `end_time` also stays legal — 175 rows
 * have one, so the rule applies only when BOTH values are present.
 *
 * @param {string|null|undefined} startTime - HH:MM, or absent
 * @param {string|null|undefined} endTime - HH:MM, or absent
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateSetTimes(startTime, endTime) {
  if (!startTime || !endTime) {
    return { valid: true, error: undefined };
  }
  if (startTime === endTime) {
    return { valid: false, error: "Start and end time cannot be the same" };
  }
  return { valid: true, error: undefined };
}

/**
 * Validate date string and check if it's a valid calendar date
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Object} { valid: boolean, error: string|null, date: Date|null }
 */
export function validateDate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return { valid: false, error: "Date is required", date: null };
  }

  // Check format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return {
      valid: false,
      error: "Date must be in YYYY-MM-DD format",
      date: null,
    };
  }

  // Parse and validate the date
  const [year, month, day] = dateString.split("-").map(Number);

  // Check year range (reasonable bounds)
  if (year < 2020 || year > 2100) {
    return { valid: false, error: "Year must be between 2020 and 2100", date: null };
  }

  // Check month
  if (month < 1 || month > 12) {
    return { valid: false, error: "Month must be between 01 and 12", date: null };
  }

  // Check day. Shares isRealCalendarDate with isValidISODate so the two cannot
  // disagree about which dates exist; the specific day count is recomputed here
  // only to name it in the error message.
  if (!isRealCalendarDate(year, month, day)) {
    const probe = new Date(0);
    probe.setFullYear(year, month, 0);
    return {
      valid: false,
      error: `Day must be between 01 and ${probe.getDate()} for this month`,
      date: null,
    };
  }

  const date = new Date(dateString);
  return { valid: true, error: undefined, date };
}

/**
 * Validate a performance's festival-day assignment (#540, multi-day events).
 *
 * `performanceDate` is optional — null/undefined/"" all mean "inherit the
 * event's single date" (the pre-#540 default for every existing row) and are
 * always valid. When provided, it must be a real YYYY-MM-DD calendar date
 * that falls within the event's festival-day span [event.date, event.end_date].
 * A null `event.end_date` collapses that span to the single `event.date`
 * (single-day events only ever have one valid value).
 *
 * Comparisons are plain lexicographic string comparisons on YYYY-MM-DD —
 * never `new Date(...)`, which parses bare date strings as UTC and drifts a
 * day in negative-offset timezones (see CLAUDE.md).
 *
 * @param {string|null|undefined} performanceDate
 * @param {{ date: string, end_date: string|null }|null} event
 * @returns {{ valid: boolean, error: string|null, value: string|null }}
 */
export function validatePerformanceDate(performanceDate, event) {
  if (performanceDate === undefined || performanceDate === null || performanceDate === "") {
    return { valid: true, error: undefined, value: null };
  }

  if (typeof performanceDate !== "string") {
    return { valid: false, error: "performance_date must be a YYYY-MM-DD string", value: null };
  }

  const dateCheck = validateDate(performanceDate);
  if (!dateCheck.valid) {
    return { valid: false, error: dateCheck.error, value: null };
  }

  const minDate = event?.date || null;
  const maxDate = event?.end_date || event?.date || null;

  if (!minDate || performanceDate < minDate || performanceDate > maxDate) {
    return {
      valid: false,
      error: `performance_date must be between ${minDate || "the event start"} and ${maxDate || "the event end"}`,
      value: null,
    };
  }

  return { valid: true, error: undefined, value: performanceDate };
}

/**
 * Validate an event's per-day doors/gates-open time map (#569).
 *
 * `doorsJson` is optional — null/undefined/"" all mean "no doors info" (the
 * default for every pre-#569 row) and are always valid. When provided it
 * must be a JSON object whose keys are YYYY-MM-DD dates that fall within the
 * event's festival-day span [event.date, event.end_date] (same rule and same
 * lexicographic YYYY-MM-DD comparisons as `validatePerformanceDate` — never
 * `new Date(...)`, see CLAUDE.md) and whose values are 24-hour "HH:MM"
 * times. An empty object is normalized to null (equivalent to absent).
 *
 * @param {string|object|null|undefined} doorsJson - raw JSON string or already-parsed object
 * @param {{ date: string, end_date: string|null }|null} event
 * @returns {{ valid: boolean, error: string|null, value: string|null }}
 */
export function validateDoorsJson(doorsJson, event) {
  if (doorsJson === undefined || doorsJson === null || doorsJson === "") {
    return { valid: true, error: undefined, value: null };
  }

  let parsed;
  if (typeof doorsJson === "string") {
    if (doorsJson.length > FIELD_LIMITS.eventDoorsJson.max) {
      return {
        valid: false,
        error: `Doors times must be no more than ${FIELD_LIMITS.eventDoorsJson.max} characters`,
        value: null,
      };
    }
    try {
      parsed = JSON.parse(doorsJson);
    } catch {
      return { valid: false, error: "Doors times must be valid JSON", value: null };
    }
  } else if (typeof doorsJson === "object") {
    parsed = doorsJson;
  } else {
    return { valid: false, error: "Doors times must be a JSON object", value: null };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, error: "Doors times must be a JSON object", value: null };
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return { valid: true, error: undefined, value: null };
  }

  const minDate = event?.date || null;
  const maxDate = event?.end_date || event?.date || null;

  for (const [dateKey, timeValue] of entries) {
    const dateCheck = validateDate(dateKey);
    if (!dateCheck.valid) {
      return { valid: false, error: `Doors times key "${dateKey}" must be a valid YYYY-MM-DD date`, value: null };
    }

    if (!minDate || dateKey < minDate || dateKey > maxDate) {
      return {
        valid: false,
        error: `Doors times date "${dateKey}" must be between ${minDate || "the event start"} and ${maxDate || "the event end"}`,
        value: null,
      };
    }

    if (typeof timeValue !== "string" || !DOORS_TIME_REGEX.test(timeValue)) {
      return { valid: false, error: `Doors time for "${dateKey}" must be in 24-hour HH:MM format`, value: null };
    }
  }

  const serialized = JSON.stringify(parsed);
  if (serialized.length > FIELD_LIMITS.eventDoorsJson.max) {
    return {
      valid: false,
      error: `Doors times must be no more than ${FIELD_LIMITS.eventDoorsJson.max} characters`,
      value: null,
    };
  }

  return { valid: true, error: undefined, value: serialized };
}
