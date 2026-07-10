// Admin events endpoint
// GET /api/admin/events - List all events
// POST /api/admin/events - Create new event

import { checkPermission, auditLog } from "./_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
  safeReflectSocialLinksString,
  sanitizeEventSocialLinks,
  sanitizeVenueInfo,
  validateDoorsJson,
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
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "1000", 10);
    const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 1000;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

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

    const result = await DB.prepare(query)
      .bind(...queryParams)
      .all();

    // Read-path sanitize (#493): `e.*` pulls in the raw social_links column,
    // which may hold a pre-#483 (or otherwise legacy) value never routed
    // through sanitizeEventSocialLinks on write.
    const events = (result.results || []).map((event) => ({
      ...event,
      social_links: safeReflectSocialLinksString(event.social_links, ["instagram", "x", "tiktok"]),
    }));

    return new Response(
      JSON.stringify({
        events,
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
      end_date,
      slug,
      status,
      description,
      city,
      ticket_url,
      venue_info,
      social_links,
      theme_colors,
      doors_json,
    } = validation.sanitized;

    let sanitizedVenueInfo;
    let sanitizedSocialLinks;
    try {
      sanitizedVenueInfo = sanitizeVenueInfo(venue_info);
      sanitizedSocialLinks = sanitizeEventSocialLinks(social_links);
    } catch (error) {
      return validationErrorResponse(error.message);
    }

    // Cross-field check (needs date/end_date, so it can't live in the
    // schema-level `validate` above) — mirrors validatePerformanceDate.
    const doorsCheck = validateDoorsJson(doors_json, { date, end_date });
    if (!doorsCheck.valid) {
      return validationErrorResponse(doorsCheck.error);
    }
    const sanitizedDoorsJson = doorsCheck.value;
    if (status === "archived" && currentUser.role !== "admin") {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Only admins can create archived events directly",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate date is not in past (unless status is archived for retroactive
    // events). Compare YYYY-MM-DD strings lexicographically rather than via Date
    // objects: new Date('YYYY-MM-DD') parses as UTC midnight, which reads as
    // "yesterday" in UTC-negative timezones and would wrongly reject an event
    // dated today (same bug class as the schedule-storage note in CLAUDE.md).
    const eventDateStr = String(date).slice(0, 10);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (eventDateStr < todayStr && status !== "archived") {
      return validationErrorResponse(
        currentUser.role === "admin"
          ? "Date cannot be in the past unless you are intentionally creating an archived historical event"
          : "Date cannot be in the past. Ask an admin to create an archived historical event if needed",
      );
    }

    if (end_date && end_date < date) {
      return validationErrorResponse("End date must be on or after the event start date");
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
        end_date,
        slug,
        status,
        is_published,
        description,
        city,
        ticket_url,
        venue_info,
        social_links,
        theme_colors,
        doors_json,
        created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(
        name,
        date,
        end_date,
        slug,
        status,
        status === "published" ? 1 : 0,
        description,
        city,
        ticket_url,
        sanitizedVenueInfo,
        sanitizedSocialLinks,
        theme_colors,
        sanitizedDoorsJson,
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
