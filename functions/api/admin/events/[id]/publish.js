// Publish/Unpublish event endpoint
// POST /api/admin/events/{id}/publish

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP } from "../../../../utils/request.js";

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}

// POST - Publish or unpublish event (editor and admin only)
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
    const { publish } = body;

    // Determine new status
    const newStatus = publish ? "published" : "draft";

    // If publishing, check that event has at least 1 band
    if (publish) {
      const bandCount = await DB.prepare(
        `SELECT COUNT(*) as count FROM performances WHERE event_id = ?`,
      )
        .bind(eventId)
        .first();

      if (bandCount.count === 0) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message:
              "Cannot publish event with no bands. Add at least one band first.",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Update event status
    const result = await DB.prepare(
      `
      UPDATE events
      SET status = ?, is_published = ?, updated_by_user_id = ?
      WHERE id = ?
      RETURNING *
    `,
    )
      .bind(newStatus, publish ? 1 : 0, currentUser.userId, eventId)
      .first();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      publish ? "event.published" : "event.unpublished",
      "event",
      eventId,
      {
        name: event.name,
        status: newStatus,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
        message: publish
          ? "Event published successfully"
          : "Event unpublished successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error publishing/unpublishing event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event publish status",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
