// Admin events endpoint
// GET /api/admin/events - List all events
// POST /api/admin/events - Create new event

import { checkPermission, auditLog } from './_middleware.js'

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// GET - List all events (all authenticated users can view)
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    // Check permission (viewer and above)
    const permCheck = await checkPermission(request, env, 'viewer');
    if (permCheck.error) {
      return permCheck.response;
    }

    // Parse query parameters
    const url = new URL(request.url);
    const showArchived = url.searchParams.get('archived') === 'true';

    // Build query based on archived filter
    let query = `
      SELECT
        e.*,
        COUNT(b.id) as band_count
      FROM events e
      LEFT JOIN bands b ON e.id = b.event_id
    `;

    // Filter by archived status
    if (!showArchived) {
      query += ` WHERE (e.status != 'archived' OR e.status IS NULL)`;
    }

    query += `
      GROUP BY e.id
      ORDER BY e.date DESC
    `;

    const result = await DB.prepare(query).all();

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

// POST - Create new event (editor and admin only)
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check permission (editor and above)
    const permCheck = await checkPermission(request, env, 'editor');
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    const body = await request.json().catch(() => ({}));
    const { name, date, slug, status = 'draft' } = body;

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

    // Validate name (min 3 chars)
    if (name.trim().length < 3) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Name must be at least 3 characters",
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

    // Validate date is not in past
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Date cannot be in the past",
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

    // Validate status
    if (!['draft', 'published', 'archived'].includes(status)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Status must be: draft, published, or archived",
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

    // Create event with creator tracking
    const result = await DB.prepare(
      `
      INSERT INTO events (name, date, slug, status, is_published, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `
    )
      .bind(name, date, slug, status, status === 'published' ? 1 : 0, currentUser.userId)
      .first();

    // Audit log
    await auditLog(env, currentUser.userId, 'event.created', 'event', result.id, {
      name,
      slug,
      status
    }, ipAddress);

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
