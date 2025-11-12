// Admin specific band operations
// PUT /api/admin/bands/{id} - Update band
// DELETE /api/admin/bands/{id} - Delete band

// Helper to extract band ID from path
function getBandId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("bands") + 1;
  return parts[idIndex];
}

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

  const toMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);

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

// PUT - Update band
export async function onRequestPut(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const bandId = getBandId(request);

    if (!bandId || isNaN(bandId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid band ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { venueId, name, startTime, endTime, url } = body;

    // Check if band exists first
    const band = await DB.prepare(
      `
      SELECT * FROM bands WHERE id = ?
    `,
    )
      .bind(bandId)
      .first();

    if (!band) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Band not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validation - only validate provided fields
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Band name cannot be empty",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Check for duplicate band name (excluding current band)
      const existingBand = await DB.prepare(
        `SELECT id, name FROM bands WHERE LOWER(name) = LOWER(?) AND id != ?`,
      )
        .bind(name, bandId)
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
    }

    // Validate time format (only if times are provided)
    if (startTime !== undefined && !/^\d{2}:\d{2}$/.test(startTime)) {
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

    if (endTime !== undefined && !/^\d{2}:\d{2}$/.test(endTime)) {
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

    // Determine actual times to use (provided or existing)
    const actualStartTime = startTime !== undefined ? startTime : band.start_time;
    const actualEndTime = endTime !== undefined ? endTime : band.end_time;
    const actualVenueId = venueId !== undefined ? venueId : band.venue_id;

    // Validate that end time is after start time (using actual values)
    if (actualStartTime && actualEndTime && actualStartTime >= actualEndTime) {
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

    // Check if venue exists (only if venueId is being changed)
    if (venueId !== undefined && venueId !== null) {
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

    // Check for conflicts only if we have all required scheduling fields
    let conflicts = [];
    if (actualVenueId && actualStartTime && actualEndTime && band.event_id) {
      conflicts = await checkConflicts(
        DB,
        band.event_id,
        actualVenueId,
        actualStartTime,
        actualEndTime,
        bandId,
      );
    }

    // Build dynamic update query based on provided fields
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (venueId !== undefined) {
      updates.push("venue_id = ?");
      params.push(venueId);
    }
    if (startTime !== undefined) {
      updates.push("start_time = ?");
      params.push(startTime);
    }
    if (endTime !== undefined) {
      updates.push("end_time = ?");
      params.push(endTime);
    }
    if (url !== undefined) {
      updates.push("url = ?");
      params.push(url || null);
    }

    // If no fields to update, return error
    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "No fields to update",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Add band ID as final parameter
    params.push(bandId);

    // Update band with dynamic query
    const result = await DB.prepare(
      `
      UPDATE bands
      SET ${updates.join(", ")}
      WHERE id = ?
      RETURNING *
    `,
    )
      .bind(...params)
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
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating band:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update band",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// DELETE - Delete band
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const bandId = getBandId(request);

    if (!bandId || isNaN(bandId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid band ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if band exists
    const band = await DB.prepare(
      `
      SELECT * FROM bands WHERE id = ?
    `,
    )
      .bind(bandId)
      .first();

    if (!band) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Band not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Delete band
    await DB.prepare(
      `
      DELETE FROM bands WHERE id = ?
    `,
    )
      .bind(bandId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Band deleted successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error deleting band:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to delete band",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
