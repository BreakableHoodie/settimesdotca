// Public API endpoint for fetching event schedules
// GET /api/schedule?event=current
// GET /api/schedule?event={slug}

import { getPublicDataGateResponse } from "../utils/publicGate.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const url = new URL(request.url);
  const eventParam = url.searchParams.get("event") || "current";

  try {
    const { DB } = env;

    let event;

    if (eventParam === "current") {
      // Get the current or next upcoming published event
      // The -6 hour buffer keeps the event visible during late-night/overnight
      // sets that span past midnight (e.g. 11:30pm-12:30am)
      event = await DB.prepare(
        `
        SELECT * FROM events
        WHERE is_published = 1
          AND date >= date('now', '-6 hours')
        ORDER BY date ASC
        LIMIT 1
      `,
      ).first();
    } else {
      // Get event by slug
      event = await DB.prepare(
        `
        SELECT * FROM events
        WHERE slug = ? AND is_published = 1
      `,
      )
        .bind(eventParam)
        .first();
    }

    if (!event) {
      return new Response(
        JSON.stringify({
          error: "Event not found",
          message:
            eventParam === "current"
              ? "No published events available"
              : `Event "${eventParam}" not found or not published`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get all performances for this event with venue and band information
    // V2 Schema: performances -> band_profiles + venues
    const bandsResult = await DB.prepare(
      `
      SELECT
        p.id as performance_id,
        b.id as band_id,
        b.name,
        p.start_time as startTime,
        p.end_time as endTime,
        b.social_links,
        v.name as venue
      FROM performances p
      INNER JOIN band_profiles b ON p.band_profile_id = b.id
      INNER JOIN venues v ON p.venue_id = v.id
      WHERE p.event_id = ?
      ORDER BY p.start_time, v.name
    `,
    )
      .bind(event.id)
      .all();

    const bands = bandsResult.results || [];

    // Format response to match existing bands.json structure
    const formattedBands = bands.map((band) => {
      // Extract time from datetime string or time-only format
      // Handles: "2026-01-17 20:00" -> "20:00" OR "20:00" -> "20:00"
      const extractTime = (datetime) => {
        if (!datetime || datetime === 'TBD') return 'TBD';
        // If it contains a space, it's a full datetime - extract time part
        if (datetime.includes(' ')) {
          const timePart = datetime.split(' ')[1];
          return timePart ? timePart.substring(0, 5) : 'TBD'; // Get HH:MM
        }
        // Otherwise, it's already in time format (HH:MM or HH:MM:SS)
        return datetime.substring(0, 5); // Get HH:MM
      };

      // Parse social links to find a primary URL
      let primaryUrl = null;
      try {
        if (band.social_links) {
          const links = JSON.parse(band.social_links);
          // Prioritize website, then bandcamp, then instagram, etc.
          primaryUrl = links.website || links.bandcamp || links.instagram || links.facebook || links.spotify || null;
        }
      } catch (_) {
        // Ignore JSON parse errors
      }

      return {
        id: `${band.name.toLowerCase().replace(/\s+/g, "-")}-${band.performance_id}`,
        performance_id: band.performance_id,
        band_profile_id: band.band_id,
        name: band.name,
        venue: band.venue,
        date: event.date,
        startTime: extractTime(band.startTime),
        endTime: extractTime(band.endTime),
        url: primaryUrl,
      };
    });

    // Include event metadata for frontend display
    const eventMetadata = {
      id: event.id,
      name: event.name,
      date: event.date,
      slug: event.slug,
      ticket_url: event.ticket_url,
      theme_colors: event.theme_colors,
      venue_info: event.venue_info,
      social_links: event.social_links,
    };

    return new Response(
      JSON.stringify({
        bands: formattedBands,
        event: eventMetadata,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      },
    );
  } catch (error) {
    console.error("Error fetching schedule:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch event schedule",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
