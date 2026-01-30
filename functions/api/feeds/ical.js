// iCal feed generation
// Format: https://portland.ics?genre=indie
// Compatible with Google Calendar, Apple Calendar, Outlook

import { getPublicDataGateResponse } from "../../utils/publicGate.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const url = new URL(request.url);

  // Extract city from subdomain or path
  const hostname = url.hostname;
  const pathParts = url.pathname.split("/");
  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";

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
        v.name as venue_name,
        v.address
      FROM events e
      LEFT JOIN performances p ON p.event_id = e.id
      LEFT JOIN band_profiles bp ON p.band_profile_id = bp.id
      LEFT JOIN venues v ON v.id = p.venue_id
      WHERE e.is_published = 1
      AND e.date >= date('now')
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

    query += ` ORDER BY e.date ASC, p.start_time ASC`;

    const { results: bands } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    // Generate iCal content
    const ical = generateICal(bands, city, genre);

    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${city}-${genre}.ics"`,
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

  let ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Concert Schedule//EN",
    `X-WR-CALNAME:${city} ${genre} Shows`,
    "X-WR-TIMEZONE:America/Los_Angeles",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const band of bands) {
    if (!band.band_name) continue;

    // Parse date and time
    const eventDate = band.date; // YYYY-MM-DD
    const startTime = band.start_time || "20:00"; // HH:MM
    const endTime = band.end_time || "21:00";

    // Convert to iCal format (YYYYMMDDTHHMMSS)
    const dtstart = `${eventDate.replace(/-/g, "")}T${startTime.replace(/:/g, "")}00`;
    const dtend = `${eventDate.replace(/-/g, "")}T${endTime.replace(/:/g, "")}00`;

    // Generate unique ID using performance ID to ensure uniqueness per band
    const uid = `performance-${band.performance_id}-${eventDate}@concertschedule.app`;

    // Location
    const location = band.venue_name
      ? `${band.venue_name}${band.address ? ", " + band.address : ""}`
      : "TBD";

    // Description
    const description = [
      band.band_name,
      band.venue_name ? `Venue: ${band.venue_name}` : "",
      band.description || "",
    ]
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
      "STATUS:CONFIRMED",
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
    .replace(/\n/g, "\\n");
}
