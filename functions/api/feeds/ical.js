// iCal feed generation
// GET /api/feeds/ical?city=…&genre=…
// Compatible with Google Calendar, Apple Calendar, Outlook

import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { publicEventStatusSql } from "../../utils/eventVisibility.js";
import { nextCalendarDay } from "../../utils/eventDay.js";

/**
 * A set's default duration when no end time was recorded: one hour after the
 * start, wrapping past midnight (23:30 -> 00:30). The caller's endDate roll
 * turns that wrap into the next calendar day, so DTEND stays after DTSTART.
 */
function addOneHour(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function sanitizeFilenamePart(value) {
  return (
    String(value || "all")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "all"
  );
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const url = new URL(request.url);

  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";
  // "all" is this endpoint's sentinel for "no filter", not a value anyone
  // chose -- so it must never reach a label a human reads. Before #1096 the
  // unfiltered feed (the default, and the one the site links) called itself
  // `X-WR-CALNAME:all all Shows` and downloaded as `all-all.ics`. That is the
  // name the calendar keeps in a subscriber's sidebar for as long as they stay
  // subscribed, and the only branding a subscription carries.
  const activeFilters = [city, genre].filter((value) => value !== "all");
  const calendarName = activeFilters.length > 0 ? `${activeFilters.join(" ")} Shows` : "settimes.ca";
  // Brand rather than "Waterloo Region": the platform has hosted an event
  // outside the region, and a calendar name is a claim that stays on screen.
  const safeFilenameStem = activeFilters.length > 0 ? activeFilters.map(sanitizeFilenamePart).join("-") : "settimes";

  try {
    // Get events
    // V2 Schema: events -> performances -> band_profiles
    let query = `
      SELECT DISTINCT
        e.id,
        e.name,
        e.slug,
        e.date,
        e.description,
        e.city,
        bp.name as band_name,
        p.id as performance_id,
        p.start_time,
        p.end_time,
        p.performance_date,
        p.is_cancelled,
        v.name as venue_name,
        v.address
      FROM events e
      LEFT JOIN performances p ON p.event_id = e.id AND (e.reveal_mode = 0 OR p.is_announced = 1)
      LEFT JOIN band_profiles bp ON p.band_profile_id = bp.id
      LEFT JOIN venues v ON v.id = p.venue_id
      WHERE ${publicEventStatusSql("e")}
      AND COALESCE(e.end_date, e.date) >= date('now')
    `;

    const params = [];

    if (city !== "all") {
      query += ` AND LOWER(e.city) = LOWER(?)`;
      params.push(city);
    }

    if (genre !== "all") {
      query += ` AND LOWER(bp.genre) = LOWER(?)`;
      params.push(genre);
    }

    query += ` ORDER BY e.date ASC, COALESCE(p.performance_date, e.date) ASC, p.start_time ASC`;

    const { results: bands } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    // Generate iCal content
    const ical = generateICal(bands, calendarName);

    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilenameStem}.ics"`,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("iCal generation error:", error);
    return new Response("Failed to generate calendar feed", { status: 500 });
  }
}

/**
 * @param {object[]} bands
 * @param {string} calendarName - the finished X-WR-CALNAME. Passed in rather
 *   than re-derived from city/genre here: those are the caller's "all"
 *   sentinels, and letting them travel this far is how `all all Shows` reached
 *   subscribers' sidebars (#1096).
 */
function generateICal(bands, calendarName) {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SetTimes//settimes.ca//EN",
    `X-WR-CALNAME:${escapeIcal(calendarName)}`,
    "X-WR-TIMEZONE:America/Toronto",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const band of bands) {
    if (!band.band_name) continue;

    // Parse date and time
    // Per-set festival day: a performance carries its own performance_date
    // when the event spans multiple days (epic #543); NULL inherits the
    // event's single date, keeping single-day events byte-identical.
    const eventDate = band.performance_date || band.date; // YYYY-MM-DD

    // A set with no announced start time is NOT a calendar entry.
    //
    // This used to read `band.start_time || "20:00"`, which stated a time
    // nobody had chosen as fact. On 2026-09-02 that put all 15 Vol 18 sets in
    // subscribers' calendars stacked at 8:00 PM -- 100% of the feed's content
    // fabricated -- while /event/lwbc18 correctly said "Time To Be Announced".
    // The two public surfaces disagreed about the same rows (#1079).
    //
    // Omitting is the honest shape and the consistent one: this feed is
    // performance-driven, so it already reports an event with no lineup as no
    // VEVENTs. An unscheduled set is the same case one row down. Absence of an
    // entry is recoverable; a wrong entry in a calendar someone trusts is not.
    if (!band.start_time) continue;

    const startTime = band.start_time; // HH:MM
    // Derived from the start, never a constant. A literal "21:00" against a
    // 23:00 start is BEFORE it, which the endDate roll below then reads as a
    // midnight straddle -- turning a missing end time into a 22-hour event.
    // No such row exists in production today; nothing stops one being written.
    const endTime = band.end_time || addOneHour(startTime);

    // A set that straddles midnight (e.g. 23:30–00:30) ENDS on the next
    // calendar day — stamping both ends with the same date would put DTEND
    // before DTSTART, an invalid VEVENT some clients reject (#601). Zero-padded
    // HH:MM compares lexicographically; this mirrors prepareBands()'s
    // `endMs < startMs` +1-day roll in frontend/src/utils/bandUtils.js. Pure
    // after-midnight sets (start 00:00–05:59) are unaffected: both stamps
    // correctly share the stored date.
    const endDate = endTime < startTime ? nextCalendarDay(eventDate) : eventDate;

    // Convert to iCal format (YYYYMMDDTHHMMSS)
    const dtstart = `${eventDate.replace(/-/g, "")}T${startTime.replace(/:/g, "")}00`;
    const dtend = `${endDate.replace(/-/g, "")}T${endTime.replace(/:/g, "")}00`;

    // Generate unique ID using performance ID to ensure uniqueness per band
    const uid = `performance-${band.performance_id}-${eventDate}@settimes.ca`;

    // Location
    const location = band.venue_name ? `${band.venue_name}${band.address ? ", " + band.address : ""}` : "TBD";

    // Description
    const description = [band.band_name, band.venue_name ? `Venue: ${band.venue_name}` : "", band.description || ""]
      .filter(Boolean)
      .join("\\n");

    ical.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${escapeIcal(band.band_name)}`,
      `LOCATION:${escapeIcal(location)}`,
      `DESCRIPTION:${escapeIcal(description)}`,
      // RFC 5545 STATUS:CANCELLED -- Google and Apple Calendar render the entry
      // as cancelled natively, so no custom handling is needed on the client.
      ...(band.is_cancelled ? ["STATUS:CANCELLED"] : ["STATUS:CONFIRMED"]),
      "END:VEVENT",
    );
  }

  ical.push("END:VCALENDAR");

  return ical.join("\r\n");
}

function escapeIcal(text) {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}
