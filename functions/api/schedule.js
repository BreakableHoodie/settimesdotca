// Public API endpoint for fetching event schedules
// GET /api/schedule?event=current
// GET /api/schedule?event={slug}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const eventParam = url.searchParams.get("event") || "current";

  try {
    const { DB } = env;

    let event;
    let bands;

    if (eventParam === "current") {
      // Get the most recent published event
      event = await DB.prepare(
        `
        SELECT * FROM events
        WHERE is_published = 1
        ORDER BY date DESC
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

    // Get all bands for this event with venue information
    const bandsResult = await DB.prepare(
      `
      SELECT
        b.id,
        b.name,
        b.start_time as startTime,
        b.end_time as endTime,
        b.url,
        v.name as venue
      FROM bands b
      INNER JOIN venues v ON b.venue_id = v.id
      WHERE b.event_id = ?
      ORDER BY b.start_time, v.name
    `,
    )
      .bind(event.id)
      .all();

    bands = bandsResult.results || [];

    // Format response to match existing bands.json structure
    const formattedBands = bands.map((band) => ({
      id: `${band.name.toLowerCase().replace(/\s+/g, "-")}-${band.id}`,
      name: band.name,
      venue: band.venue,
      date: event.date,
      startTime: band.startTime,
      endTime: band.endTime,
      url: band.url || null,
    }));

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
