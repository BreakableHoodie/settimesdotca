// Admin events endpoint
// GET /api/admin/events - List all events
// POST /api/admin/events - Create new event

// GET - List all events
export async function onRequestGet(context) {
  const { env } = context;
  const { DB } = env;

  try {
    const result = await DB.prepare(
      `
      SELECT
        e.*,
        COUNT(b.id) as band_count
      FROM events e
      LEFT JOIN bands b ON e.id = b.event_id
      GROUP BY e.id
      ORDER BY e.date DESC
    `
    ).all();

    return new Response(
      JSON.stringify({
        events: result.results || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching events:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch events",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// POST - Create new event
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const body = await request.json().catch(() => ({}));
    const { name, date, slug, isPublished = false } = body;

    // Validation
    if (!name || !date || !slug) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Name, date, and slug are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Date must be in YYYY-MM-DD format",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate slug format (URL-friendly)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message:
            "Slug must contain only lowercase letters, numbers, and hyphens",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if slug already exists
    const existingEvent = await DB.prepare(
      `
      SELECT id FROM events WHERE slug = ?
    `
    )
      .bind(slug)
      .first();

    if (existingEvent) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "An event with this slug already exists",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create event
    const result = await DB.prepare(
      `
      INSERT INTO events (name, date, slug, is_published)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `
    )
      .bind(name, date, slug, isPublished ? 1 : 0)
      .first();

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create event",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
