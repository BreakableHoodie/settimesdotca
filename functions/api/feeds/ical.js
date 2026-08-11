// iCal feed generation
// GET /api/feeds/ical?city=…&genre=…
// Compatible with Google Calendar, Apple Calendar, Outlook

import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { publicEventStatusSql } from "../../utils/eventVisibility.js";

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
  const safeCityForFilename = sanitizeFilenamePart(city);
  const safeGenreForFilename = sanitizeFilenamePart(genre);

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
    const ical = generateICal(bands, city, genre);

    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeCityForFilename}-${safeGenreForFilename}.ics"`,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("iCal generation error:", error);
    return new Response("Failed to generate calendar feed", { status: 500 });
  }
}

function generateICal(bands, city, genre) {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SetTimes//settimes.ca//EN",
    `X-WR-CALNAME:${escapeIcal(`${city} ${genre} Shows`)}`,
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
    const startTime = band.start_time || "20:00"; // HH:MM
    const endTime = band.end_time || "21:00";

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

/**
 * YYYY-MM-DD → the following calendar day, DST-proof via UTC math (the
 * string is a date literal, not a moment in time).
 */
function nextCalendarDay(dateStr) {
  const next = new Date(`${dateStr}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function escapeIcal(text) {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}
