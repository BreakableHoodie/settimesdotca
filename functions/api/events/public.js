// Public API for event discovery
// No authentication required
// Rate limited to prevent abuse

import { getPublicDataGateResponse } from "../../utils/publicGate.js";

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
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
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
        CASE WHEN e.date >= date('now', '-6 hours') THEN 1 ELSE 0 END as is_upcoming,
        COUNT(DISTINCT p.band_profile_id) as band_count,
        COUNT(DISTINCT p.venue_id) as venue_count
      FROM events e
      LEFT JOIN performances p ON p.event_id = e.id
      WHERE e.is_published = 1
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
    // This prevents events from disappearing while still ongoing
    if (upcoming) {
      query += ` AND e.date >= date('now', '-6 hours')`;
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

    // Return JSON
    return new Response(
      JSON.stringify({
        events: filteredEvents,
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
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
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
