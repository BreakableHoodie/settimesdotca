// Public API for event discovery
// No authentication required
// Rate limited to prevent abuse

import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { CACHE_BROWSE } from "../../utils/cacheHeaders.js";
import { normalizeHttpUrl } from "../../utils/validation.js";
import { publicEventStatusSql } from "../../utils/eventVisibility.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const url = new URL(request.url);

  // Query parameters
  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 100) : 50;
  const upcoming = url.searchParams.get("upcoming") !== "false"; // Default true

  try {
    // Build query
    // V2 Schema: events -> performances -> band_profiles
    let query = `
      SELECT
        e.id,
        e.name,
        e.slug,
        e.date,
        e.description,
        e.city,
        e.ticket_url,
        e.poster_url,
        CASE WHEN COALESCE(e.end_date, e.date) >= date('now', '-6 hours') THEN 1 ELSE 0 END as is_upcoming,
        COUNT(DISTINCT p.band_profile_id) as band_count,
        COUNT(DISTINCT p.venue_id) as venue_count
      FROM events e
      LEFT JOIN performances p ON p.event_id = e.id
      WHERE ${publicEventStatusSql("e")}
    `;

    const params = [];

    // Filter by city
    if (city !== "all") {
      query += ` AND LOWER(e.city) = LOWER(?)`;
      params.push(city);
    }

    // Filter by genre (optimized to avoid N+1 queries)
    if (genre !== "all") {
      query += ` AND EXISTS (
        SELECT 1 FROM performances p2
        JOIN band_profiles bp ON p2.band_profile_id = bp.id
        WHERE p2.event_id = e.id
        AND LOWER(bp.genre) = LOWER(?)
      )`;
      params.push(genre);
    }

    // Filter by upcoming (future events only)
    // Use -6 hours offset to account for ET timezone (UTC-5/UTC-4)
    // This prevents events from disappearing while still ongoing.
    // COALESCE(end_date, date): a multi-day event stays "upcoming" through its
    // end_date instead of dropping off the morning after it starts (#539).
    if (upcoming) {
      query += ` AND COALESCE(e.end_date, e.date) >= date('now', '-6 hours')`;
    }

    query += `
      GROUP BY e.id
      ORDER BY e.date ASC
      LIMIT ?
    `;
    params.push(limit);

    // Execute query (single query, no N+1 problem)
    const { results: filteredEvents } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    // Read-path sanitize (#504): a pre-validation legacy ticket_url (e.g. a
    // javascript: scheme) must not be reflected to this public, unauthenticated
    // endpoint — normalizeHttpUrl returns null for anything that isn't a real
    // http(s) URL.
    // poster_url gets the same treatment (#658, matches the ticket_url
    // precedent above): pre-#616 rows were never write-validated, so a legacy
    // unsafe scheme must never reach this response.
    const sanitizedEvents = filteredEvents.map((event) => ({
      ...event,
      ticket_url: normalizeHttpUrl(event.ticket_url),
      poster_url: normalizeHttpUrl(event.poster_url),
    }));

    // Return JSON
    return new Response(
      JSON.stringify({
        events: sanitizedEvents,
        filters: {
          city: city,
          genre: genre,
          upcoming: upcoming,
          limit: limit,
        },
        count: filteredEvents.length,
        generated_at: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          // Intentional wildcard: this is a public, credential-free, read-only endpoint.
          // Do NOT add Access-Control-Allow-Credentials: true here.
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": CACHE_BROWSE,
        },
      },
    );
  } catch (error) {
    console.error("Public API error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch events" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
