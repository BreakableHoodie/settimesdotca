// Admin venues endpoint
// GET /api/admin/venues - List all venues
// POST /api/admin/venues - Create new venue

import { checkPermission, auditLog } from "./_middleware.js";

// GET - List all venues
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require viewer role or higher
  const permCheck = await checkPermission(request, env, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const result = await DB.prepare(
      `
      SELECT
        v.*,
        COUNT(b.id) as band_count
      FROM venues v
      LEFT JOIN bands b ON v.id = b.venue_id
      GROUP BY v.id
      ORDER BY v.name
    `,
    ).all();

    return new Response(
      JSON.stringify({
        venues: result.results || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching venues:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch venues",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// POST - Create new venue
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require admin role (venues are structural)
  const permCheck = await checkPermission(request, env, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown";

  try {
    const body = await request.json().catch(() => ({}));
    const { name, address } = body;

    // Validation
    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Venue name is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if venue already exists
    const existingVenue = await DB.prepare(
      `
      SELECT id FROM venues WHERE name = ?
    `,
    )
      .bind(name)
      .first();

    if (existingVenue) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "A venue with this name already exists",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create venue
    const result = await DB.prepare(
      `
      INSERT INTO venues (name, address)
      VALUES (?, ?)
      RETURNING *
    `,
    )
      .bind(name, address || null)
      .first();

    // Audit log the creation
    await auditLog(
      env,
      user.userId,
      "venue.created",
      "venue",
      result.id,
      {
        venueName: name,
        address,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        venue: result,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating venue:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create venue",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
