// Admin specific event operations
// PATCH /api/admin/events/{id} - Update event details
// PUT /api/admin/events/{id}/publish - Toggle publish status
// POST /api/admin/events/{id}/duplicate - Duplicate event
// DELETE /api/admin/events/{id} - Delete event

import { checkPermission, auditLog } from "../_middleware.js";

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}

// PATCH - Update event details (editor and admin only)
export async function onRequestPatch(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check permission (editor and above)
    const permCheck = await checkPermission(request, env, "editor");
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
    const { name, date, status } = body;

    // Validate: cannot change slug
    if (body.slug && body.slug !== event.slug) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Cannot change slug (would break URLs)",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];

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
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Date must be in YYYY-MM-DD format",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      updates.push("date = ?");
      params.push(date);
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
      updates.push("status = ?");
      updates.push("is_published = ?");
      params.push(status);
      params.push(status === "published" ? 1 : 0);
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
        changes: { name, date, status },
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
    const permCheck = await checkPermission(request, env, "editor");
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
      const result = await DB.prepare(
        `
        UPDATE events
        SET is_published = ?, updated_by_user_id = ?
        WHERE id = ?
        RETURNING *
      `,
      )
        .bind(newStatus, currentUser.userId, eventId)
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

// POST - Duplicate event (editor and admin only)
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const ipAddress = getClientIP(request);

  try {
    // Check permission (editor and above)
    const permCheck = await checkPermission(request, env, 'editor');
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

    // Check if this is a duplicate request
    if (url.pathname.endsWith("/duplicate")) {
      const body = await request.json().catch(() => ({}));
      const { name, date, slug } = body;

      // Validation
      if (!name || !date || !slug) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Name, date, and slug are required for duplicate event",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get original event
      const originalEvent = await DB.prepare(
        `
        SELECT * FROM events WHERE id = ?
      `,
      )
        .bind(eventId)
        .first();

      if (!originalEvent) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Original event not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
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

      // Create new event (unpublished by default)
      const newEvent = await DB.prepare(
        `
        INSERT INTO events (name, date, slug, is_published)
        VALUES (?, ?, ?, 0)
        RETURNING *
      `,
      )
        .bind(name, date, slug)
        .first();

      // Copy all bands from original event
      await DB.prepare(
        `
        INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url)
        SELECT ?, venue_id, name, start_time, end_time, url
        FROM bands
        WHERE event_id = ?
      `,
      )
        .bind(newEvent.id, eventId)
        .run();

      // Get band count
      const bandCount = await DB.prepare(
        `
        SELECT COUNT(*) as count FROM bands WHERE event_id = ?
      `,
      )
        .bind(newEvent.id)
        .first();

      // Audit log
      await auditLog(
        env,
        currentUser.userId,
        'event.duplicated',
        'event',
        newEvent.id,
        {
          name: newEvent.name,
          originalEventId: eventId,
          bandsCopied: bandCount.count,
        },
        ipAddress
      );

      return new Response(
        JSON.stringify({
          success: true,
          event: newEvent,
          bandsCopied: bandCount.count,
          message: `Event duplicated successfully with ${bandCount.count} bands`,
        }),
        {
          status: 201,
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
    console.error("Error duplicating event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to duplicate event",
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
    const permCheck = await checkPermission(request, env, "admin");
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
      "SELECT COUNT(*) as count FROM bands WHERE event_id = ?",
    )
      .bind(eventIdNum)
      .first();

    // Delete the event (database will automatically set event_id to NULL for bands due to ON DELETE SET NULL)
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
        message: `Event "${event.name}" deleted successfully${bandCount.count > 0 ? ` (${bandCount.count} band(s) are now unassigned and can be moved to other events)` : ""}`,
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
