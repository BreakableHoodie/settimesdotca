// Archive event endpoint
// POST /api/admin/events/{id}/archive

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP } from "../../../../utils/request.js";

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}

// POST - Archive event (admin only)
export async function onRequestPost(context) {
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

    // Check if already archived
    if (event.status === "archived") {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Event is already archived",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Archive event
    const result = await DB.prepare(
      `
      UPDATE events
      SET status = 'archived', archived_at = datetime('now'), is_published = 0, updated_by_user_id = ?
      WHERE id = ?
      RETURNING *
    `,
    )
      .bind(currentUser.userId, eventId)
      .first();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "event.archived",
      "event",
      eventId,
      {
        name: event.name,
        previousStatus: event.status,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
        message: "Event archived successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error archiving event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to archive event",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
