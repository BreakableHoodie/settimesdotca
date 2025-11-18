// Band performance history and statistics
// GET /api/admin/bands/stats/{name} - Get performance history and stats for a band

import { checkPermission } from "../../_middleware.js";

// Helper to extract band name from path
function getBandName(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const nameIndex = parts.indexOf("stats") + 1;
  return decodeURIComponent(parts[nameIndex] || "");
}

// GET - Fetch performance history and stats for a band by name
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require viewer role or higher
  const permCheck = await checkPermission(request, env, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const bandName = getBandName(request);

    if (!bandName || bandName.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Band name is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get all performances by this band with event and venue details
    const performances = await DB.prepare(
      `
      SELECT
        b.id,
        b.name,
        b.start_time,
        b.end_time,
        b.photo_url,
        b.description,
        b.genre,
        b.origin,
        b.social_links,
        e.id as event_id,
        e.name as event_name,
        e.date as event_date,
        e.location as event_location,
        v.id as venue_id,
        v.name as venue_name,
        v.address as venue_address
      FROM bands b
      LEFT JOIN events e ON b.event_id = e.id
      LEFT JOIN venues v ON b.venue_id = v.id
      WHERE LOWER(b.name) = LOWER(?)
      ORDER BY e.date DESC, b.start_time DESC
    `,
    )
      .bind(bandName)
      .all();

    const history = performances.results || [];

    if (history.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "No performances found for this band",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Calculate statistics
    const totalShows = history.filter((p) => p.event_id !== null).length;
    const uniqueVenues = new Set(
      history.filter((p) => p.venue_id !== null).map((p) => p.venue_id),
    );
    const uniqueEvents = new Set(
      history.filter((p) => p.event_id !== null).map((p) => p.event_id),
    );

    // Get band profile data from most recent entry
    const latestEntry = history[0];
    const profile = {
      name: latestEntry.name,
      photo_url: latestEntry.photo_url,
      description: latestEntry.description,
      genre: latestEntry.genre,
      origin: latestEntry.origin,
      social_links: latestEntry.social_links,
    };

    return new Response(
      JSON.stringify({
        profile,
        stats: {
          totalShows,
          uniqueVenues: uniqueVenues.size,
          uniqueEvents: uniqueEvents.size,
        },
        performances: history.map((p) => ({
          id: p.id,
          event: p.event_id
            ? {
                id: p.event_id,
                name: p.event_name,
                date: p.event_date,
                location: p.event_location,
              }
            : null,
          venue: p.venue_id
            ? {
                id: p.venue_id,
                name: p.venue_name,
                address: p.venue_address,
              }
            : null,
          startTime: p.start_time,
          endTime: p.end_time,
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching band stats:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch band statistics",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
