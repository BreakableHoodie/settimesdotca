// Admin events endpoint
// GET /api/admin/events - List all events
// POST /api/admin/events - Create new event

import { checkPermission, auditLog } from "./_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
} from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";

// GET - List all events (all authenticated users can view)
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    // Check permission (viewer and above)
    const permCheck = await checkPermission(context, "viewer");
    if (permCheck.error) {
      return permCheck.response;
    }

    // Parse query parameters
    const url = new URL(request.url);
    const showArchived = url.searchParams.get("archived") === "true";
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;

    // Build query based on archived filter
    let query = `
      SELECT
        e.*,
        COUNT(DISTINCT p.band_profile_id) as band_count
      FROM events e
      LEFT JOIN performances p ON e.id = p.event_id
    `;
    const queryParams = [];

    // Filter by archived status
    if (!showArchived) {
      query += ` WHERE (e.status != 'archived' OR e.status IS NULL)`;
    }

    query += `
      GROUP BY e.id
      ORDER BY e.date DESC
      LIMIT ?
      OFFSET ?
    `;
    queryParams.push(limit, offset);

    const result = await DB.prepare(query).bind(...queryParams).all();

    return new Response(
      JSON.stringify({
        events: result.results || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
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
      },
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
    const permCheck = await checkPermission(context, "editor");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    const body = await request.json().catch(() => ({}));
    if (body.ticketLink && !body.ticket_url) {
      body.ticket_url = body.ticketLink;
    }

    // Validate input using schema
    const validation = validateEntity(body, VALIDATION_SCHEMAS.event);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return validationErrorResponse(firstError, { fields: validation.errors });
    }

    const {
      name,
      date,
      slug,
      status,
      description,
      city,
      ticket_url,
      venue_info,
      social_links,
      theme_colors,
    } = validation.sanitized;

    // Validate date is not in past (unless status is archived for retroactive events)
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today && status !== "archived") {
      return validationErrorResponse(
        "Date cannot be in the past (use archived status for past events)",
      );
    }

    // Check if slug already exists
    const existingEvent = await DB.prepare(
      `
      SELECT id FROM events WHERE slug = ?
    `,
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
        },
      );
    }

    // Create event with creator tracking
    const result = await DB.prepare(
      `
      INSERT INTO events (
        name,
        date,
        slug,
        status,
        is_published,
        description,
        city,
        ticket_url,
        venue_info,
        social_links,
        theme_colors,
        created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(
        name,
        date,
        slug,
        status,
        status === "published" ? 1 : 0,
        description,
        city,
        ticket_url,
        venue_info,
        social_links,
        theme_colors,
        currentUser.userId,
      )
      .first();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "event.created",
      "event",
      result.id,
      {
        name,
        slug,
        status,
        city,
        ticket_url,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
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
      },
    );
  }
}
