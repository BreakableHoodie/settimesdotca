// iCal feed generation
// GET /api/feeds/ical?city=…&genre=…&band=<band_profiles.id>
// Compatible with Google Calendar, Apple Calendar, Outlook

import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { publicEventStatusSql } from "../../utils/eventVisibility.js";
import { AFTER_MIDNIGHT_THRESHOLD_TIME, eventLocalFestivalToday, nextCalendarDay } from "../../utils/eventDay.js";

/**
 * A set with no recorded end lasts one hour, stated as a DURATION rather than
 * a computed wall-clock DTEND. On the night Toronto repeats 01:00 (first Sunday
 * of November), 01:30 + one wall-clock hour is a two-hour event; a DURATION is
 * elapsed time, so it stays one hour (RFC 5545 3.8.2.5).
 */
const DEFAULT_SET_DURATION_LINE = "DURATION:PT1H";

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
  let calendarName = activeFilters.length > 0 ? `${activeFilters.join(" ")} Shows` : "settimes.ca";
  // Brand rather than "Waterloo Region": the platform has hosted an event
  // outside the region, and a calendar name is a claim that stays on screen.
  let safeFilenameStem = activeFilters.length > 0 ? activeFilters.map(sanitizeFilenamePart).join("-") : "settimes";

  // `?band=` is a fan subscribing their calendar to one artist ("Add to my
  // calendar" on the band page). It filters THIS feed rather than being a
  // second one, so the calendar rules (no invented times, cancellations,
  // after-midnight dating, reveal-mode gate) cannot drift between the two.
  const bandParam = url.searchParams.get("band");
  if (bandParam !== null && !/^[1-9]\d{0,9}$/.test(bandParam)) {
    return new Response("Invalid band id", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  try {
    let bandProfile = null;
    if (bandParam !== null) {
      bandProfile = await env.DB.prepare("SELECT id, name FROM band_profiles WHERE id = ?").bind(bandParam).first();
      if (!bandProfile) {
        return new Response("Band not found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      // The name a subscriber's calendar keeps for as long as they stay
      // subscribed, like the city/genre names above.
      calendarName = `${bandProfile.name} on settimes.ca`;
      safeFilenameStem = sanitizeFilenamePart(bandProfile.name);
    }

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
      AND COALESCE(e.end_date, e.date) >= ?
    `;

    // The Toronto FESTIVAL day, never SQLite's date('now'), which is UTC. That
    // rolled over at 8 PM Eastern on Vol 18's show night and emptied the feed
    // for every subscriber while the remaining sets, after-midnight closer
    // included, were still to play. eventLocalFestivalToday() keeps the event
    // current until 06:00 local the morning after its last day.
    const params = [eventLocalFestivalToday()];

    if (city !== "all") {
      query += ` AND LOWER(e.city) = LOWER(?)`;
      params.push(city);
    }

    // Substring, not equality (#1214): artist genres are free text ("Punk Rock",
    // "Folk Punk", "Post-Punk"), so `?genre=punk` by equality returned a quarter of
    // the punk acts. instr() rather than LIKE: a `%` or `_` in the query string
    // must not act as a wildcard.
    if (genre !== "all") {
      query += ` AND instr(LOWER(bp.genre), LOWER(?)) > 0`;
      params.push(genre);
    }

    // An off-season band simply matches nothing: a valid, empty calendar that
    // fills in when the next lineup is announced, which is the point.
    if (bandProfile) {
      query += ` AND bp.id = ?`;
      params.push(bandProfile.id);
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
// Set times are Toronto wall-clock times. A DTSTART with no TZID is FLOATING
// under RFC 5545, so a subscriber travelling to Vancouver saw a 20:00 set at
// 20:00 Vancouver time, three hours late. X-WR-TIMEZONE is a non-standard hint
// that does not change that. Canada's rules since 2007. The on-device route
// export (#1261) carries the same block; Pages Functions cannot import from
// frontend/, so keep the two in step.
const TORONTO_TZID = "America/Toronto";
const TORONTO_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TORONTO_TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

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
    ...TORONTO_VTIMEZONE,
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
    // A missing end is never a constant. A literal "21:00" against a 23:00
    // start is BEFORE it, which the endDate roll below reads as a midnight
    // straddle -- turning a missing end time into a 22-hour event.
    const endTime = band.end_time;

    // `eventDate` is the FESTIVAL day. A set starting before the after-midnight
    // threshold belongs to that evening but happens on the NEXT calendar day
    // (CLAUDE.md "After-midnight band sorting"; mirrors prepareBands()'s +1 day
    // in frontend/src/utils/bandUtils.js). Stamping it with the festival date
    // put Vol 18's 00:25 closer in calendars the morning BEFORE the show.
    const startDate = startTime < AFTER_MIDNIGHT_THRESHOLD_TIME ? nextCalendarDay(eventDate) : eventDate;

    // A set that straddles midnight (e.g. 23:30–00:30) ENDS on the day after it
    // starts — stamping both ends with the same date would put DTEND before
    // DTSTART, an invalid VEVENT some clients reject (#601). Zero-padded HH:MM
    // compares lexicographically, mirroring prepareBands()'s `endMs < startMs`
    // +1-day roll.
    const endDate = endTime && endTime < startTime ? nextCalendarDay(startDate) : startDate;

    // Convert to iCal format (YYYYMMDDTHHMMSS)
    const dtstart = `${startDate.replace(/-/g, "")}T${startTime.replace(/:/g, "")}00`;
    const endLine = endTime
      ? `DTEND;TZID=${TORONTO_TZID}:${endDate.replace(/-/g, "")}T${endTime.replace(/:/g, "")}00`
      : DEFAULT_SET_DURATION_LINE;

    // Generate unique ID using performance ID to ensure uniqueness per band.
    // Keyed on the festival date, not startDate: a subscribed calendar matches
    // entries by UID, so changing it would duplicate the set instead of moving it.
    const uid = `performance-${band.performance_id}-${eventDate}@settimes.ca`;

    // Location
    const location = band.venue_name ? `${band.venue_name}${band.address ? ", " + band.address : ""}` : "TBD";

    // Description. Joined with a REAL newline: escapeIcal encodes it once as
    // "\\n". Joining with a literal "\\n" and escaping again served "\\\\n",
    // which calendars showed as the text "\\n" (#1251 review).
    const description = [band.band_name, band.venue_name ? `Venue: ${band.venue_name}` : "", band.description || ""]
      .filter(Boolean)
      .join("\n");

    ical.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=${TORONTO_TZID}:${dtstart}`,
      endLine,
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
