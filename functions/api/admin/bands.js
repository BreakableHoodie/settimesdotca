// Admin bands endpoint
// GET /api/admin/bands?event_id={id} - List bands for an event
// POST /api/admin/bands - Create new band

// Helper to check for time conflicts
async function checkConflicts(
  DB,
  eventId,
  venueId,
  startTime,
  endTime,
  excludeBandId = null,
) {
  const conflicts = [];

  // Convert HH:MM to minutes for easier comparison
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);

  // Get all bands at the same venue for the same event
  const query = excludeBandId
    ? `SELECT * FROM bands WHERE event_id = ? AND venue_id = ? AND id != ?`
    : `SELECT * FROM bands WHERE event_id = ? AND venue_id = ?`;

  const bindings = excludeBandId
    ? [eventId, venueId, excludeBandId]
    : [eventId, venueId];

  const result = await DB.prepare(query)
    .bind(...bindings)
    .all();
  const existingBands = result.results || [];

  for (const band of existingBands) {
    const bandStart = toMinutes(band.start_time);
    const bandEnd = toMinutes(band.end_time);

    // Check for overlap
    // Overlap occurs if: (newStart < bandEnd) AND (newEnd > bandStart)
    if (newStart < bandEnd && newEnd > bandStart) {
      conflicts.push({
        id: band.id,
        name: band.name,
        startTime: band.start_time,
        endTime: band.end_time,
      });
    }
  }

  return conflicts;
}

// GET - List bands for an event
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event_id");

  try {
    let result;

    if (eventId) {
      // Get bands for specific event
      result = await DB.prepare(
        `
        SELECT
          b.*,
          v.name as venue_name,
          e.name as event_name
        FROM bands b
        INNER JOIN venues v ON b.venue_id = v.id
        INNER JOIN events e ON b.event_id = e.id
        WHERE b.event_id = ?
        ORDER BY b.start_time, v.name
      `,
      )
        .bind(eventId)
        .all();
    } else {
      // Get all bands (including orphaned ones)
      result = await DB.prepare(
        `
        SELECT
          b.*,
          v.name as venue_name,
          e.name as event_name
        FROM bands b
        LEFT JOIN venues v ON b.venue_id = v.id
        LEFT JOIN events e ON b.event_id = e.id
        ORDER BY b.start_time, v.name
      `,
      ).all();
    }

    return new Response(
      JSON.stringify({
        bands: result.results || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching bands:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch bands",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// POST - Create new band
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const body = await request.json().catch(() => ({}));
    const { eventId, venueId, name, startTime, endTime, url } = body;

    // Validation
    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Band name is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // For rolodex bands (no event), only name is required
    // For event bands, venue and times are required
    if (eventId && (!venueId || !startTime || !endTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message:
            "For event bands, venueId, startTime, and endTime are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate time format (HH:MM) only if times are provided
    if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid start time format. Use HH:MM (24-hour format)",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid end time format. Use HH:MM (24-hour format)",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate that end time is after start time (only if both are provided)
    if (startTime && endTime && startTime >= endTime) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "End time must be after start time",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if event exists (only if eventId is provided)
    if (eventId) {
      const event = await DB.prepare(
        `
        SELECT id FROM events WHERE id = ?
      `,
      )
        .bind(eventId)
        .first();

      if (!event) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Event not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Check if venue exists (only if venueId is provided)
    if (venueId) {
      const venue = await DB.prepare(
        `
        SELECT id FROM venues WHERE id = ?
      `,
      )
        .bind(venueId)
        .first();

      if (!venue) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Venue not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Check for duplicate band name
    const existingBand = await DB.prepare(
      `SELECT id, name FROM bands WHERE LOWER(name) = LOWER(?)`,
    )
      .bind(name)
      .first();

    if (existingBand) {
      return new Response(
        JSON.stringify({
          error: "Duplicate band name",
          message: `A band named "${name}" already exists. Please choose a different name.`,
        }),
        {
          status: 409, // Conflict
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check for conflicts (only if we have event, venue, and times)
    let conflicts = [];
    if (eventId && venueId && startTime && endTime) {
      conflicts = await checkConflicts(
        DB,
        eventId,
        venueId,
        startTime,
        endTime,
      );
    }

    // Create band
    const result = await DB.prepare(
      `
      INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(eventId, venueId, name, startTime, endTime, url || null)
      .first();

    return new Response(
      JSON.stringify({
        success: true,
        band: result,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        warning:
          conflicts.length > 0
            ? `This band overlaps with ${conflicts.length} other band(s) at the same venue`
            : undefined,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating band:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create band",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
