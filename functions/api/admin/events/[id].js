// Admin specific event operations
// PATCH /api/admin/events/{id} - Update event details
// PUT /api/admin/events/{id}/publish - Toggle publish status
// POST /api/admin/events/{id}/duplicate - Duplicate event
// DELETE /api/admin/events/{id} - Delete event

import { checkPermission, auditLog } from "../_middleware.js";
import {
  FIELD_LIMITS,
  isValidURL,
  sanitizeEventSocialLinks,
  sanitizeString,
  sanitizeVenueInfo,
  validateDate,
} from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}

function parseJsonField(value, label) {
  if (value === undefined) {
    return { value: undefined };
  }

  if (value === null || value === "") {
    return { value: null };
  }

  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return { value };
    } catch {
      return { error: `${label} must be valid JSON` };
    }
  }

  if (typeof value === "object") {
    try {
      return { value: JSON.stringify(value) };
    } catch {
      return { error: `${label} must be valid JSON` };
    }
  }

  return { error: `${label} must be valid JSON` };
}

// PATCH - Update event details (editor and admin only)
export async function onRequestPatch(context) {
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
    const eventId = getEventId(request);

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid event ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get current event
    const event = await DB.prepare(`SELECT * FROM events WHERE id = ?`)
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

    const body = await request.json().catch(() => ({}));
    if (body.ticketLink && !body.ticket_url) {
      body.ticket_url = body.ticketLink;
    }
    const {
      name,
      date,
      end_date,
      status,
      description,
      city,
      ticket_url,
      venue_info,
      social_links,
      theme_colors,
    } = body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];

    if (body.slug !== undefined && body.slug !== event.slug) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Slug cannot be changed after creation",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (name !== undefined) {
      if (name.trim().length < 3) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Name must be at least 3 characters",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      updates.push("name = ?");
      params.push(name);
    }

    if (date !== undefined) {
      const dateResult = validateDate(date);
      if (!dateResult.valid) {
        return new Response(
          JSON.stringify({ error: "Validation error", message: dateResult.error }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("date = ?");
      params.push(date);
    }

    if (end_date !== undefined) {
      const normalizedEndDate = end_date || null;
      if (normalizedEndDate !== null) {
        const endDateResult = validateDate(normalizedEndDate);
        if (!endDateResult.valid) {
          return new Response(
            JSON.stringify({ error: "Validation error", message: endDateResult.error }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const effectiveStartDate = date ?? event.date;
        if (normalizedEndDate < effectiveStartDate) {
          return new Response(
            JSON.stringify({ error: "Validation error", message: "End date must be on or after the event start date" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      updates.push("end_date = ?");
      params.push(normalizedEndDate);
    }

    if (status !== undefined) {
      // Validate status
      if (!["draft", "published", "archived"].includes(status)) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Status must be: draft, published, or archived",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (status === "archived") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Use the dedicated archive action to archive events",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      updates.push("status = ?");
      updates.push("is_published = ?");
      params.push(status);
      params.push(status === "published" ? 1 : 0);
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Description must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const sanitized = description ? sanitizeString(description) : "";
      if (sanitized.length > FIELD_LIMITS.eventDescription.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Description must be no more than ${FIELD_LIMITS.eventDescription.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("description = ?");
      params.push(sanitized || null);
    }

    if (city !== undefined) {
      if (city !== null && typeof city !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "City must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const sanitized = city ? sanitizeString(city) : "";
      if (sanitized.length > FIELD_LIMITS.eventCity.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `City must be no more than ${FIELD_LIMITS.eventCity.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("city = ?");
      params.push(sanitized || null);
    }

    if (ticket_url !== undefined) {
      if (ticket_url !== null && typeof ticket_url !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Ticket link must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const trimmed = ticket_url ? ticket_url.trim() : "";
      if (trimmed && !isValidURL(trimmed)) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Ticket link must be a valid URL",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (trimmed.length > FIELD_LIMITS.ticketLink.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Ticket link must be no more than ${FIELD_LIMITS.ticketLink.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("ticket_url = ?");
      params.push(trimmed || null);
    }

    if (venue_info !== undefined) {
      try {
        const sanitizedVenueInfo = sanitizeVenueInfo(venue_info);
        if (sanitizedVenueInfo && sanitizedVenueInfo.length > FIELD_LIMITS.eventVenueInfo.max) {
          return new Response(
            JSON.stringify({
              error: "Validation error",
              message: `Venue info must be no more than ${FIELD_LIMITS.eventVenueInfo.max} characters`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        updates.push("venue_info = ?");
        params.push(sanitizedVenueInfo ?? null);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: error.message,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (social_links !== undefined) {
      try {
        const sanitizedSocialLinks = sanitizeEventSocialLinks(social_links);
        if (sanitizedSocialLinks && sanitizedSocialLinks.length > FIELD_LIMITS.eventSocialLinks.max) {
          return new Response(
            JSON.stringify({
              error: "Validation error",
              message: `Social links must be no more than ${FIELD_LIMITS.eventSocialLinks.max} characters`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        updates.push("social_links = ?");
        params.push(sanitizedSocialLinks ?? null);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: error.message,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (theme_colors !== undefined) {
      const parsed = parseJsonField(theme_colors, "Theme colors");
      if (parsed.error) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: parsed.error,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (typeof parsed.value === "string" && parsed.value.length > FIELD_LIMITS.eventThemeColors.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Theme colors must be no more than ${FIELD_LIMITS.eventThemeColors.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("theme_colors = ?");
      params.push(parsed.value ?? null);
    }

    // Always update updated_by_user_id
    updates.push("updated_by_user_id = ?");
    params.push(currentUser.userId);

    // Add event ID as the last parameter
    params.push(eventId);

    if (updates.length === 1) {
      // Only updated_by_user_id, no actual changes
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

    // Execute update
    const result = await DB.prepare(
      `UPDATE events SET ${updates.join(", ")} WHERE id = ? RETURNING *`,
    )
      .bind(...params)
      .first();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "event.updated",
      "event",
      eventId,
      {
        name: name || event.name,
        changes: { name, date, status, slug: body.slug },
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
        message: "Event updated successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// PUT - Toggle publish status (editor and admin only)
export async function onRequestPut(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const ipAddress = getClientIP(request);

  try {
    // Check permission (editor and above)
    const permCheck = await checkPermission(context, "editor");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;
    const eventId = getEventId(request);

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid event ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if this is a publish request
    if (url.pathname.endsWith("/publish")) {
      // Get current event
      const event = await DB.prepare(
        `
        SELECT * FROM events WHERE id = ?
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

      // Toggle publish status
      const newStatus = event.is_published === 1 ? 0 : 1;
      const nextStatus = newStatus === 1 ? "published" : "draft";
      const result = await DB.prepare(
        `
        UPDATE events
        SET is_published = ?, status = ?, updated_by_user_id = ?
        WHERE id = ?
        RETURNING *
      `,
      )
        .bind(newStatus, nextStatus, currentUser.userId, eventId)
        .first();

      // Audit log
      await auditLog(
        env,
        currentUser.userId,
        newStatus === 1 ? "event.published" : "event.unpublished",
        "event",
        eventId,
        {
          name: event.name,
        },
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: true,
          event: result,
          message: newStatus === 1 ? "Event published" : "Event unpublished",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "Unknown operation",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// DELETE - Delete event (admin only)
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;
    const eventId = getEventId(request);
    const eventIdNum = parseInt(eventId);

    if (isNaN(eventIdNum)) {
      return new Response(JSON.stringify({ error: "Invalid event ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if event exists
    const event = await DB.prepare("SELECT id, name FROM events WHERE id = ?")
      .bind(eventIdNum)
      .first();

    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if event has any bands (for informational message)
    const bandCount = await DB.prepare(
      "SELECT COUNT(*) as count FROM performances WHERE event_id = ?",
    )
      .bind(eventIdNum)
      .first();

    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const confirmCascade =
      body?.confirmCascade === true ||
      url.searchParams.get("confirmCascade") === "true";

    if (bandCount.count > 0 && !confirmCascade) {
      return new Response(
        JSON.stringify({
          error: "Confirmation required",
          message:
            "Deleting this event will permanently remove associated performance records. Repeat the request with confirmCascade=true to continue.",
          affectedPerformanceCount: bandCount.count,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Delete the event (performance records are removed automatically via ON DELETE CASCADE)
    await DB.prepare("DELETE FROM events WHERE id = ?").bind(eventIdNum).run();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "event.deleted",
      "event",
      eventIdNum,
      {
        name: event.name,
        bandCount: bandCount.count,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Event "${event.name}" deleted successfully${bandCount.count > 0 ? ` (${bandCount.count} performance record(s) were permanently deleted with this event)` : ""}`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Delete event error:", error);
    return new Response(
      JSON.stringify({
        error: "Database operation failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
