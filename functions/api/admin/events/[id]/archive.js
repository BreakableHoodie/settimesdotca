// Archive event endpoint
// POST /api/admin/events/{id}/archive

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP, getUrlId } from "../../../../utils/request.js";
import { safeReflectSocialLinksString } from "../../../../utils/validation.js";

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
    const { valid, value: eventId } = getUrlId(request, "events");

    if (!valid) {
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
    const event = await DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(eventId).first();

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
    // Re-check status at write time: if a concurrent request already
    // archived (or otherwise changed) this row between the read above and
    // this UPDATE, an unconditional write would silently re-archive it --
    // clobbering archived_at and firing a duplicate audit log -- instead of
    // the read-time check above catching it.
    const result = await DB.prepare(
      `
      UPDATE events
      SET status = 'archived', archived_at = datetime('now'), updated_by_user_id = ?
      WHERE id = ? AND status IN ('draft', 'published')
      RETURNING *
    `,
    )
      .bind(currentUser.userId, eventId)
      .first();

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "Event status changed concurrently. Reload and try again.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Read-path sanitize (#493): RETURNING * echoes the full row, so
    // social_links may reflect a pre-#483 (or otherwise legacy) value.
    result.social_links = safeReflectSocialLinksString(result.social_links, ["instagram", "x", "tiktok"]);

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
